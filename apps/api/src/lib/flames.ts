/**
 * Flammes d'amitié (séries partagées) : la flamme d'un duo d'amis grandit chaque
 * jour (UTC) où LES DEUX ont appris. Des paliers rapportent de l'XP aux deux.
 */
import type { Friendship, User } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays } from './srs.js';

export const FLAME_MILESTONES: { days: number; xp: number; title: string }[] = [
  { days: 3, xp: 10, title: 'Étincelle' },
  { days: 7, xp: 25, title: 'Flamme vive' },
  { days: 14, xp: 40, title: 'Feu de camp' },
  { days: 30, xp: 80, title: 'Brasier' },
  { days: 50, xp: 120, title: 'Volcan' },
  { days: 100, xp: 250, title: 'Soleil' },
  { days: 200, xp: 400, title: 'Supernova' },
  { days: 365, xp: 700, title: 'Flamme éternelle' },
];

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/** État affichable d'une flamme pour l'un des deux amis. */
export function flameState(f: Friendship, meIsRequester: boolean, today = utcDay()) {
  const yesterday = utcDay(addDays(new Date(`${today}T12:00:00Z`), -1));
  const alive = f.flameDate === today || f.flameDate === yesterday;
  const mine = meIsRequester ? f.aDate : f.bDate;
  const theirs = meIsRequester ? f.bDate : f.aDate;
  const value = alive ? f.flame : 0;
  let status: 'lit' | 'waiting_me' | 'waiting_friend' | 'waiting_both' | 'out';
  if (f.flameDate === today) status = 'lit';
  else if (mine === today) status = 'waiting_friend';
  else if (theirs === today) status = 'waiting_me';
  else status = alive ? 'waiting_both' : 'out';
  const next = FLAME_MILESTONES.find((m) => m.days > value);
  return { flame: value, best: f.flameBest, status, atRisk: alive && f.flameDate !== today, next: next ? { days: next.days, title: next.title, xp: next.xp } : null };
}

export interface FlameEvent {
  friend: string;
  flame: number;
  milestone?: { days: number; title: string; xp: number };
}

/** À appeler quand l'utilisateur a appris aujourd'hui. Renvoie les flammes qui ont grandi. */
export async function touchFlames(user: User): Promise<FlameEvent[]> {
  const today = utcDay();
  const yesterday = utcDay(addDays(new Date(), -1));
  const rows = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: { select: { id: true, displayName: true } }, addressee: { select: { id: true, displayName: true } } },
  });
  const events: FlameEvent[] = [];
  for (const f of rows) {
    const isA = f.requesterId === user.id;
    if ((isA ? f.aDate : f.bDate) === today) continue; // déjà compté aujourd'hui
    const aDate = isA ? today : f.aDate;
    const bDate = isA ? f.bDate : today;
    const data: Record<string, unknown> = isA ? { aDate: today } : { bDate: today };
    if (aDate === today && bDate === today && f.flameDate !== today) {
      const flame = f.flameDate === yesterday ? f.flame + 1 : 1;
      Object.assign(data, { flame, flameDate: today, flameBest: Math.max(f.flameBest, flame) });
      const friend = isA ? f.addressee : f.requester;
      const ev: FlameEvent = { friend: friend.displayName, flame };
      const m = FLAME_MILESTONES.find((x) => x.days === flame && !f.milestones.includes(x.days));
      if (m) {
        data.milestones = [...f.milestones, m.days];
        ev.milestone = m;
        // Les deux amis reçoivent le bonus.
        await prisma.user.updateMany({ where: { id: { in: [f.requesterId, f.addresseeId] } }, data: { xp: { increment: m.xp } } });
        await prisma.activityLog.createMany({
          data: [f.requesterId, f.addresseeId].map((uid) => ({ userId: uid, type: 'flame', message: `🔥 Flamme d'amitié « ${m.title} » : ${flame} jours ensemble (+${m.xp} XP)`, meta: { friendshipId: f.id } })),
        });
      }
      events.push(ev);
    }
    // Mise à jour conditionnelle : évite de compter deux fois en cas de requêtes simultanées.
    await prisma.friendship.updateMany({ where: { id: f.id, ...(isA ? { aDate: f.aDate } : { bDate: f.bDate }) }, data });
  }
  return events;
}
