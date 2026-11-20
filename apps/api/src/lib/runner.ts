import { config } from '../config.js';
import { HttpError } from './http.js';

export interface RunStream {
  exitCode: number;
  timeMs: number;
  stdout: string;
  stderr: string;
}
export interface RunnerResult {
  compile: RunStream & { ok: boolean };
  tests: (RunStream & { index: number; timedOut: boolean })[];
  error?: string;
}

/** Appelle le service d'exécution isolé (conteneurs Docker). */
export async function runCode(language: string, source: string, inputs: string[]): Promise<RunnerResult> {
  let res: Response;
  try {
    res = await fetch(`${config.runnerUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runner-token': config.runnerToken },
      body: JSON.stringify({ language, source, inputs }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new HttpError(503, "Le service d'exécution est indisponible. Réessaie dans quelques instants.");
  }
  const body = (await res.json().catch(() => ({}))) as RunnerResult & { error?: string };
  if (!res.ok) throw new HttpError(res.status === 503 ? 503 : 502, body.error ?? "Erreur du service d'exécution");
  return body;
}

export async function runnerHealth() {
  try {
    const r = await fetch(`${config.runnerUrl}/stats`, {
      headers: { 'x-runner-token': config.runnerToken },
      signal: AbortSignal.timeout(3000),
    });
    return r.ok ? await r.json() : { ok: false };
  } catch {
    return { ok: false };
  }
}
