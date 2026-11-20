import { buildApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { hashPassword } from './lib/auth.js';
import { importContent, loadContent } from './lib/content.js';

async function bootstrap() {
  if (config.autoImport) {
    try {
      const bundle = await loadContent(config.contentDir);
      await importContent(bundle);
    } catch (e) {
      console.error("Échec de l'import du contenu :", (e as Error).message);
    }
  }
  // Compte administrateur initial (optionnel, via variables d'environnement)
  if (config.adminEmail && config.adminPassword) {
    const exists = await prisma.user.findUnique({ where: { email: config.adminEmail.toLowerCase() } });
    if (!exists) {
      await prisma.user.create({
        data: {
          email: config.adminEmail.toLowerCase(),
          username: 'admin',
          displayName: 'Administrateur',
          passwordHash: await hashPassword(config.adminPassword),
          role: 'ADMIN',
        },
      });
      console.log(`Compte administrateur créé : ${config.adminEmail}`);
    }
  }
  // Nettoyage périodique des sessions expirées
  setInterval(() => prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {}), 3600_000).unref();
}

const app = await buildApp();
await bootstrap();
await app.listen({ port: config.port, host: config.host });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
