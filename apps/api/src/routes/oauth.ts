/**
 * Connexion avec Google et Facebook (OAuth 2.0 / OpenID Connect), sans dépendance.
 * Apple n'est pas proposé : « Sign in with Apple » exige un abonnement développeur payant.
 *
 * URL de redirection à déclarer chez le fournisseur :
 *   <PUBLIC_URL>/api/auth/oauth/google/callback
 *   <PUBLIC_URL>/api/auth/oauth/facebook/callback
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createSession } from '../lib/auth.js';
import { getSettings } from '../lib/settings.js';
import { extendPremium } from '../lib/plan.js';

type Provider = 'google' | 'facebook';
interface Profile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}

const PROVIDERS: Record<Provider, { authorize: string; token: string; scope: string }> = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile' },
  facebook: { authorize: 'https://www.facebook.com/v19.0/dialog/oauth', token: 'https://graph.facebook.com/v19.0/oauth/access_token', scope: 'email,public_profile' },
};

const STATE_COOKIE = 'cm_oauth';
const base = () => config.publicUrl.replace(/\/$/, '');
const redirectUri = (p: Provider) => `${base()}/api/auth/oauth/${p}/callback`;
const creds = (p: Provider) => config.oauth[p];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function fetchProfile(p: Provider, code: string): Promise<Profile> {
  const c = creds(p);
  const tokenRes = await fetch(PROVIDERS[p].token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(p), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(15_000),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: unknown };
  if (!tokenRes.ok || !tok.access_token) throw new Error(`échange du code refusé (${tokenRes.status})`);
  if (p === 'google') {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15_000) });
    const u = (await r.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; given_name?: string };
    if (!u.sub) throw new Error('profil Google invalide');
    return { id: u.sub, email: u.email ?? null, emailVerified: !!u.email_verified, name: u.given_name || u.name || 'Codeur' };
  }
  const r = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,first_name,email&access_token=${encodeURIComponent(tok.access_token)}`, { signal: AbortSignal.timeout(15_000) });
  const u = (await r.json()) as { id: string; email?: string; name?: string; first_name?: string };
  if (!u.id) throw new Error('profil Facebook invalide');
  // Facebook ne renvoie que des adresses confirmées.
  return { id: u.id, email: u.email ?? null, emailVerified: !!u.email, name: u.first_name || u.name || 'Codeur' };
}

async function uniqueUsername(name: string) {
  const baseName = (name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 18) || 'codeur').toLowerCase().padEnd(3, '0');
  let candidate = baseName;
  for (let i = 0; await prisma.user.findUnique({ where: { username: candidate } }); i++) candidate = `${baseName}${Math.floor(Math.random() * 9000) + 1000}`;
  return candidate;
}

function fail(reply: FastifyReply, message: string) {
  return reply.redirect(`/connexion?erreur=${encodeURIComponent(message)}`);
}

export default async function oauthRoutes(app: FastifyInstance) {
  app.get<{ Params: { provider: string } }>('/auth/oauth/:provider/start', async (req, reply) => {
    const p = req.params.provider as Provider;
    if (!(p in PROVIDERS) || !creds(p).clientId) return fail(reply, 'Cette méthode de connexion n’est pas activée sur ce serveur.');
    const state = randomBytes(24).toString('base64url');
    reply.setCookie(STATE_COOKIE, `${p}.${state}`, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/api/auth/oauth', maxAge: 600 });
    const url = new URL(PROVIDERS[p].authorize);
    url.search = new URLSearchParams({ client_id: creds(p).clientId, redirect_uri: redirectUri(p), response_type: 'code', scope: PROVIDERS[p].scope, state, ...(p === 'google' ? { prompt: 'select_account' } : {}) }).toString();
    return reply.redirect(url.toString());
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>('/auth/oauth/:provider/callback', async (req, reply) => {
    const p = req.params.provider as Provider;
    const cookie = req.cookies[STATE_COOKIE] ?? '';
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' });
    if (!(p in PROVIDERS) || !creds(p).clientId) return fail(reply, 'Méthode de connexion inconnue.');
    if (req.query.error) return fail(reply, 'Connexion annulée.');
    if (!req.query.code || !req.query.state || cookie !== `${p}.${req.query.state}`) return fail(reply, 'La connexion a expiré, réessaie.');

    let profile: Profile;
    try {
      profile = await fetchProfile(p, req.query.code);
    } catch (e) {
      req.log.error(e, 'OAuth');
      return fail(reply, 'Impossible de contacter le fournisseur de connexion.');
    }

    let user = (await prisma.oAuthAccount.findUnique({ where: { provider_providerId: { provider: p, providerId: profile.id } }, include: { user: true } }))?.user ?? null;
    if (!user && profile.email && profile.emailVerified) {
      // Une adresse confirmée par le fournisseur correspond à un compte existant : on le relie.
      user = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
      if (user) {
        await prisma.oAuthAccount.create({ data: { provider: p, providerId: profile.id, userId: user.id, email: profile.email } });
        if (!user.emailVerified) user = await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      }
    }
    if (!user) {
      if (!config.allowRegistration && (await prisma.user.count()) > 0) return fail(reply, 'Les inscriptions sont fermées sur ce serveur.');
      if (!profile.email) return fail(reply, 'Ton compte ne partage pas d’adresse e-mail : autorise l’accès à l’e-mail ou inscris-toi avec un mot de passe.');
      const settings = await getSettings();
      user = await prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          username: await uniqueUsername(profile.name),
          displayName: profile.name.slice(0, 40),
          passwordHash: '!oauth', // pas de mot de passe : « mot de passe oublié » permet d'en définir un
          emailVerified: profile.emailVerified,
          dailyGoalXp: settings.defaultDailyGoal,
          oauthAccounts: { create: { provider: p, providerId: profile.id, email: profile.email } },
        },
      });
      if (settings.premiumEnabled && settings.trialDays > 0) user = await extendPremium(user.id, settings.trialDays, 'trial');
    }
    if (user.disabled) return fail(reply, 'Ce compte est désactivé.');
    if (user.totpEnabled) {
      // Double authentification : même étape que la connexion par mot de passe.
      const ticket = randomBytes(32).toString('base64url');
      await prisma.loginChallenge.deleteMany({ where: { userId: user.id } });
      await prisma.loginChallenge.create({ data: { tokenHash: sha(ticket), userId: user.id, expiresAt: new Date(Date.now() + 5 * 60_000) } });
      return reply.redirect(`/connexion?ticket=${encodeURIComponent(ticket)}`);
    }
    await createSession(user, req, reply);
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return reply.redirect(user.onboardingDone ? '/' : '/bienvenue');
  });
}
