import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { LANGUAGES, getLanguage } from './languages.js';
import { runDocker, runLocal, validateJob, type JobResult } from './sandbox.js';

const PORT = Number(process.env.RUNNER_PORT ?? 4100);
const HOST = process.env.RUNNER_HOST ?? '0.0.0.0';
const TOKEN = process.env.RUNNER_TOKEN ?? '';
const DRIVER = process.env.RUNNER_DRIVER ?? 'docker';
const MAX_PARALLEL = Number(process.env.RUNNER_MAX_PARALLEL ?? 4);
const MAX_QUEUE = Number(process.env.RUNNER_MAX_QUEUE ?? 50);

if (DRIVER === 'local') {
  console.warn('⚠️  RUNNER_DRIVER=local : le code est exécuté SANS isolation. À réserver au développement.');
}

/* File d'attente simple : limite le nombre de conteneurs simultanés. */
let active = 0;
const queue: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) {
    if (queue.length >= MAX_QUEUE) throw Object.assign(new Error('Serveur saturé, réessaie dans un instant'), { statusCode: 503 });
    await new Promise<void>((r) => queue.push(r));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const stats = { jobs: 0, failures: 0, totalMs: 0, startedAt: new Date().toISOString() };

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 2 * 1024 * 1024 });

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  if (!TOKEN) return; // pas de jeton configuré (développement)
  const got = Buffer.from(String(req.headers['x-runner-token'] ?? ''));
  const want = Buffer.from(TOKEN);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return reply.code(401).send({ error: 'Jeton invalide' });
  }
});

app.get('/health', async () => ({ ok: true, driver: DRIVER, active, queued: queue.length }));

app.get('/stats', async () => ({ ...stats, active, queued: queue.length, maxParallel: MAX_PARALLEL, driver: DRIVER }));

app.get('/languages', async () =>
  Object.values(LANGUAGES).map((l) => ({ id: l.id, label: l.label, fileName: l.fileName })),
);

interface RunBody {
  language: string;
  source: string;
  inputs?: string[];
}

app.post<{ Body: RunBody }>(
  '/run',
  {
    schema: {
      body: {
        type: 'object',
        required: ['language', 'source'],
        properties: {
          language: { type: 'string' },
          source: { type: 'string' },
          inputs: { type: 'array', items: { type: 'string' }, maxItems: 30 },
        },
      },
    },
  },
  async (req, reply) => {
    const lang = getLanguage(req.body.language);
    if (!lang) return reply.code(400).send({ error: 'Langage inconnu' });
    const job = { language: lang, source: req.body.source, inputs: req.body.inputs?.length ? req.body.inputs : [''] };
    try {
      validateJob(job);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const t0 = Date.now();
    let result: JobResult;
    try {
      result = await withSlot(() => (DRIVER === 'local' ? runLocal(job) : runDocker(job)));
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
    stats.jobs++;
    stats.totalMs += Date.now() - t0;
    if (result.error) stats.failures++;
    return result;
  },
);

app.listen({ port: PORT, host: HOST }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
