import { config } from '../config.js';
import { prisma } from '../db.js';
import { importContent, loadContent } from '../lib/content.js';

const force = process.argv.includes('--force');
const bundle = await loadContent(config.contentDir);
await importContent(bundle, { force });
await prisma.$disconnect();
