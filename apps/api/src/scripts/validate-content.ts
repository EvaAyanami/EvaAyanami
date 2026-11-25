/** Valide la structure du contenu (sans base de données ni exécution). */
import { config } from '../config.js';
import { loadContent } from '../lib/content.js';

try {
  const b = await loadContent(config.contentDir);
  const chapters = b.levels.flatMap((l) => l.chapters);
  const ex = chapters.reduce((s, c) => s + c.exercises.length + c.exam.questions.length + 1, 0);
  console.log(`✔ Contenu valide : ${chapters.length} chapitres, ${ex} exercices, ${b.projects.length} projets, ${b.placement.reduce((s, p) => s + p.questions.length, 0)} questions de placement, ${b.achievements.length} succès, ${b.glossary.length} notions.`);
  for (const lang of b.languages.map((l) => l.id)) {
    const per = [1, 2, 3, 4, 5].map((lv) => b.levels.filter((l) => l.language === lang && l.level === lv).reduce((s, l) => s + l.chapters.length, 0));
    console.log(`  ${lang.padEnd(8)} chapitres par niveau : ${per.join(' / ')}`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
