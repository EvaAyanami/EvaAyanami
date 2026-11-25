/**
 * Paiement de l'abonnement avec Stripe (facultatif) : API REST appelée directement,
 * sans dépendance. Variables : STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSettings } from './settings.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from './http.js';
import { setPremiumUntil } from './plan.js';

function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = any>(path: string, body?: Record<string, unknown>, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${config.stripe.secretKey}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? form(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new HttpError(502, `Paiement indisponible : ${data?.error?.message ?? res.status}`);
  return data as T;
}

/** Vérifie l'en-tête Stripe-Signature (schéma v1, tolérance 5 minutes). */
export function verifyStripeSignature(payload: Buffer | string, header: string | undefined, secret: string, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(payload).digest();
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const sig = Buffer.from(p.slice(3), 'hex');
      return sig.length === expected.length && timingSafeEqual(sig, expected);
    });
}

const ACTIVE = ['active', 'trialing', 'past_due'];

/** Recopie l'état d'un abonnement Stripe sur le compte correspondant. */
export async function syncSubscription(subId: string, userIdHint?: string) {
  const sub = await stripe<any>(`/subscriptions/${subId}`);
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const user =
    (userIdHint && (await prisma.user.findUnique({ where: { id: userIdHint } }))) ||
    (await prisma.user.findFirst({ where: { OR: [{ stripeSubId: subId }, { stripeCustomerId: customer }] } }));
  if (!user) return null;
  // current_period_end est porté par l'abonnement (anciennes versions d'API) ou par ses lignes.
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const active = ACTIVE.includes(sub.status) && end;
  const ids = { stripeCustomerId: customer ?? user.stripeCustomerId, stripeSubId: subId };
  if (active) return setPremiumUntil(user.id, new Date(end * 1000 + 86400_000), 'stripe', undefined, ids); // 1 jour de grâce
  if (user.premiumSource === 'stripe' && user.premiumUntil && user.premiumUntil > new Date()) return setPremiumUntil(user.id, new Date(), 'stripe', undefined, ids);
  return prisma.user.update({ where: { id: user.id }, data: ids });
}

/** Génère la clé achetée (idempotent : une seule clé par paiement). */
export async function fulfillPurchase(session: any) {
  if (session?.mode !== 'payment' || session.payment_status !== 'paid' || !session.metadata?.offer) return null;
  const existing = await prisma.premiumCode.findUnique({ where: { purchaseRef: session.id } });
  if (existing) return existing;
  const offers = (await getSettings()).shopOffers;
  const offer = offers.find((o) => o.id === session.metadata.offer);
  const days = Number(session.metadata.days) || offer?.days;
  if (!days) return null;
  const buyerId = session.client_reference_id && (await prisma.user.findUnique({ where: { id: session.client_reference_id } })) ? session.client_reference_id : null;
  try {
    return await prisma.premiumCode.create({
      data: { code: newKey(), days, maxUses: 1, buyerId, offer: session.metadata.offer, amountCents: session.amount_total ?? offer?.priceCents ?? null, purchaseRef: session.id, note: `Boutique : ${offer?.label ?? days + ' jours'}` },
    });
  } catch {
    return prisma.premiumCode.findUnique({ where: { purchaseRef: session.id } }); // webhook et confirmation simultanés
  }
}

export function newKey() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s = Array.from(randomBytes(12), (b) => a[b % a.length]).join('');
  return `KIRI-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function handleStripeEvent(event: any) {
  const o = event?.data?.object ?? {};
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (o.mode === 'subscription' && o.subscription) return syncSubscription(o.subscription, o.client_reference_id ?? undefined);
      if (o.mode === 'payment') return fulfillPurchase(o);
      return null;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(o.id);
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
      return sub ? syncSubscription(sub) : null;
    }
    default:
      return null;
  }
}
