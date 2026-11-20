import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import tar from 'tar-stream';
import type { LanguageSpec } from './languages.js';

export interface RunJob {
  language: LanguageSpec;
  source: string;
  /** Entrées standard successives ; un test = une exécution du programme. */
  inputs: string[];
}

export interface StreamResult {
  exitCode: number;
  timeMs: number;
  stdout: string;
  stderr: string;
}

export interface TestRun extends StreamResult {
  index: number;
  timedOut: boolean;
}

export interface JobResult {
  compile: StreamResult & { ok: boolean };
  tests: TestRun[];
  /** Erreur interne (image absente, dépassement global…). */
  error?: string;
}

export const OUT_LIMIT = Number(process.env.RUNNER_OUTPUT_LIMIT ?? 65536);
const MAX_SOURCE = Number(process.env.RUNNER_MAX_SOURCE_BYTES ?? 100_000);

export function validateJob(job: RunJob) {
  if (Buffer.byteLength(job.source) > MAX_SOURCE) throw new Error('Fichier source trop volumineux');
  if (job.inputs.length > 30) throw new Error('Trop de tests');
  for (const i of job.inputs) if (Buffer.byteLength(i) > 200_000) throw new Error('Entrée de test trop volumineuse');
}

/* ------------------------------------------------------------------ */
/* Driver Docker (production)                                          */
/* ------------------------------------------------------------------ */

async function buildTar(job: RunJob): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on('data', (c: unknown) => { chunks.push(c as Buffer); });
  const done = new Promise<void>((res, rej) => {
    pack.on('end', () => res());
    pack.on('error', rej);
  });
  pack.entry({ name: job.language.fileName, mode: 0o644 }, job.source);
  pack.entry({ name: 'tests/', type: 'directory', mode: 0o755 });
  job.inputs.forEach((input, i) => pack.entry({ name: `tests/${i + 1}.in`, mode: 0o644 }, input));
  pack.finalize();
  await done;
  return Buffer.concat(chunks);
}

/** Arguments `docker run` : aucune capacité, pas de réseau, FS en lecture seule, limites strictes. */
export function dockerArgs(lang: LanguageSpec, name: string): string[] {
  const pids = process.env.RUNNER_PIDS_LIMIT ?? '128';
  const cpus = process.env.RUNNER_CPUS ?? '1';
  // Runtime d'isolation renforcée optionnel (ex. gVisor : RUNNER_DOCKER_RUNTIME=runsc).
  const runtime = process.env.RUNNER_DOCKER_RUNTIME ? ['--runtime', process.env.RUNNER_DOCKER_RUNTIME] : [];
  return [
    'run', '--rm', '-i',
    ...runtime,
    '--name', name,
    '--network', 'none',
    '--memory', lang.memory,
    '--memory-swap', lang.memory,
    '--cpus', cpus,
    '--pids-limit', pids,
    '--read-only',
    '--tmpfs', '/tmp:rw,exec,nosuid,size=256m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', '10001:10001',
    '--ulimit', 'cpu=60:60',
    '--ulimit', 'fsize=134217728:134217728',
    '--ulimit', 'nofile=256:256',
    '--log-driver', 'none',
    '-e', `COMPILE_CMD=${lang.compile}`,
    '-e', `RUN_CMD=${lang.run}`,
    '-e', `COMPILE_TIMEOUT=${lang.compileTimeout}`,
    '-e', `RUN_TIMEOUT=${lang.runTimeout}`,
    '-e', `OUT_LIMIT=${OUT_LIMIT}`,
    lang.image,
  ];
}

export function parseProtocol(out: string): JobResult {
  const lines = out.split('\n');
  const dec = (s: string | undefined) => Buffer.from(s ?? '', 'base64').toString('utf8');
  const result: JobResult = {
    compile: { ok: false, exitCode: -1, timeMs: 0, stdout: '', stderr: '' },
    tests: [],
  };
  let sawCompile = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('@@CM COMPILE')) {
      const [, , code, ms] = l.split(' ');
      result.compile = {
        ok: Number(code) === 0,
        exitCode: Number(code),
        timeMs: Number(ms),
        stdout: dec(lines[i + 1]),
        stderr: dec(lines[i + 2]),
      };
      if (Number(code) === 137) result.compile.stderr += '\n[Compilation interrompue : délai ou mémoire dépassés]';
      sawCompile = true;
      i += 2;
    } else if (l.startsWith('@@CM TEST')) {
      const [, , n, code, ms] = l.split(' ');
      const exit = Number(code);
      result.tests.push({
        index: Number(n) - 1,
        exitCode: exit,
        timeMs: Number(ms),
        stdout: dec(lines[i + 1]),
        stderr: dec(lines[i + 2]),
        timedOut: exit === 137 || exit === 124,
      });
      i += 2;
    } else if (l.startsWith('@@CM ERROR')) {
      result.error = l.slice(11);
    }
  }
  if (!sawCompile && !result.error) result.error = 'Réponse du bac à sable invalide';
  result.tests.sort((a, b) => a.index - b.index);
  return result;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { input?: Buffer | string; timeoutMs: number; cwd?: string; limit?: number; onTimeout?: () => void },
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const limit = opts.limit ?? 8 * 1024 * 1024;
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = Buffer.alloc(0);
    let err = Buffer.alloc(0);
    let timedOut = false;
    child.stdout.on('data', (d: Buffer) => {
      if (out.length < limit) out = Buffer.concat([out, d]).subarray(0, limit);
    });
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < limit) err = Buffer.concat([err, d]).subarray(0, limit);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      opts.onTimeout?.();
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: '', stderr: String(e), timedOut, ms: Date.now() - t0 });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code ?? (signal ? 137 : -1),
        stdout: out.toString('utf8'),
        stderr: err.toString('utf8'),
        timedOut,
        ms: Date.now() - t0,
      });
    });
    child.stdin.on('error', () => {});
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

export async function runDocker(job: RunJob): Promise<JobResult> {
  const lang = job.language;
  const name = `codemori-run-${randomUUID()}`;
  const archive = await buildTar(job);
  const globalTimeout = (lang.compileTimeout + lang.runTimeout * Math.max(1, job.inputs.length) + 15) * 1000;
  const res = await runProcess('docker', dockerArgs(lang, name), {
    input: archive,
    timeoutMs: globalTimeout,
    onTimeout: () => {
      spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
    },
  });
  if (res.timedOut) {
    return {
      compile: { ok: false, exitCode: 137, timeMs: res.ms, stdout: '', stderr: '' },
      tests: [],
      error: "Délai global d'exécution dépassé",
    };
  }
  const parsed = parseProtocol(res.stdout);
  if (parsed.error && res.stderr) parsed.error += ` — ${res.stderr.slice(0, 500)}`;
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Driver local (DÉVELOPPEMENT UNIQUEMENT — aucune isolation)          */
/* ------------------------------------------------------------------ */

const stripJvmNoise = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.startsWith('Picked up '))
    .join('\n');

export async function runLocal(job: RunJob): Promise<JobResult> {
  const lang = job.language;
  const dir = await mkdtemp(join(tmpdir(), 'codemori-'));
  try {
    await writeFile(join(dir, lang.fileName), job.source);
    await mkdir(join(dir, 'tests'));
    const c = await runProcess('sh', ['-c', lang.compile], { cwd: dir, timeoutMs: lang.compileTimeout * 1000, limit: OUT_LIMIT });
    const compile = {
      ok: c.code === 0 && !c.timedOut,
      exitCode: c.timedOut ? 137 : c.code,
      timeMs: c.ms,
      stdout: c.stdout,
      stderr: stripJvmNoise(c.stderr),
    };
    const tests: TestRun[] = [];
    if (compile.ok) {
      for (let i = 0; i < job.inputs.length; i++) {
        const r = await runProcess('sh', ['-c', `exec ${lang.run}`], {
          cwd: dir,
          input: job.inputs[i],
          timeoutMs: lang.runTimeout * 1000,
          limit: OUT_LIMIT,
        });
        tests.push({
          index: i,
          exitCode: r.timedOut ? 137 : r.code,
          timeMs: r.ms,
          stdout: r.stdout,
          stderr: stripJvmNoise(r.stderr),
          timedOut: r.timedOut,
        });
      }
    }
    return { compile, tests };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
