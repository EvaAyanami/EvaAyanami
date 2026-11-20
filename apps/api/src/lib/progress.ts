import type { Chapter, User } from '@prisma/client';
import { prisma } from '../db.js';
import { getSettings } from './settings.js';
import { logActivity, reward, type Rewards } from './gamification.js';

export type ChapterStatus = 'locked' | 'available' | 'in_progress' | 'done' | 'skipped';

/** Calcule le statut de chaque chapitre d'un langage pour un utilisateur. */
export async function chapterStatuses(userId: string, languageId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { languageId, published: true },
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
  });
  const progress = await prisma.chapterProgress.findMany({ where: { userId, chapter: { languageId } } });
  const skill = await prisma.skillProfile.findUnique({ where: { userId_languageId: { userId, languageId } } });
  const pmap = new Map(progress.map((p) => [p.chapterId, p]));
  const skillLevel = skill?.level ?? 1;
  let prevValidated = true;
  return chapters.map((c) => {
    const p = pmap.get(c.id);
    let status: ChapterStatus;
    if (p?.completedAt) status = p.skipped ? 'skipped' : 'done';
    else if (prevValidated || c.level <= skillLevel) status = p ? 'in_progress' : 'available';
    else status = 'locked';
    prevValidated = status === 'done' || status === 'skipped';
    return { chapter: c, progress: p ?? null, status };
  });
}

/** Marque le chapitre terminé si examen ET mini-projet sont validés. */
export async function maybeCompleteChapter(user: User, chapter: Chapter): Promise<{ completed: boolean; rewards?: Rewards }> {
  const p = await prisma.chapterProgress.findUnique({ where: { userId_chapterId: { userId: user.id, chapterId: chapter.id } } });
  if (!p || (p.completedAt && !p.skipped) || !p.examPassed || !p.projectPassed) return { completed: false };
  await prisma.chapterProgress.update({ where: { id: p.id }, data: { completedAt: new Date(), skipped: false } });
  await logActivity(user.id, 'chapter', `Chapitre terminé : ${chapter.title}`, { slug: chapter.slug, language: chapter.languageId });
  const settings = await getSettings();
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const rewards = await reward(fresh, { xp: settings.xpChapterCompleted, chapters: 1 });
  return { completed: true, rewards };
}

export async function touchChapter(userId: string, chapterId: string) {
  return prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    create: { userId, chapterId },
    update: {},
  });
}

/** Prochaine leçon recommandée pour un langage. */
export async function nextLesson(userId: string, languageId: string) {
  const st = await chapterStatuses(userId, languageId);
  const next = st.find((s) => s.status === 'in_progress') ?? st.find((s) => s.status === 'available');
  return next ? { slug: next.chapter.slug, title: next.chapter.title, level: next.chapter.level, language: languageId, status: next.status } : null;
}
