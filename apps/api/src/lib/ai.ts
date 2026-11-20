/**
 * Intégration IA optionnelle : toute API compatible OpenAI (chat/completions),
 * y compris Ollama (http://ollama:11434/v1). La plateforme fonctionne sans IA.
 */
import { config } from '../config.js';
import { getSettings } from './settings.js';

export async function aiAvailable() {
  const s = await getSettings();
  return s.aiEnabled && config.ai.provider !== 'none' && !!config.ai.baseUrl && !!config.ai.model;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function aiChat(messages: ChatMessage[], maxTokens = 700): Promise<string | null> {
  if (!(await aiAvailable())) return null;
  const base = config.ai.baseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.ai.apiKey ? { authorization: `Bearer ${config.ai.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.ai.model, messages, max_tokens: maxTokens, temperature: 0.4 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export function tutorSystemPrompt(ctx: { appName: string; mascot: string; chapter?: string; language?: string; level?: string; exercise?: string }) {
  return [
    `Tu es ${ctx.mascot}, l'assistante pédagogique de la plateforme ${ctx.appName}, qui enseigne Rust, C++ et Java en français.`,
    'Ton ton est doux, encourageant, précis et concis. Tu tutoies l’apprenant.',
    'Règle absolue : ne donne JAMAIS la solution complète d’un exercice. Guide par questions, indices et petits exemples différents de l’exercice.',
    'Utilise des blocs de code Markdown avec le langage indiqué. Réponds en 200 mots maximum sauf demande explicite.',
    ctx.language ? `Langage courant : ${ctx.language}.` : '',
    ctx.chapter ? `Chapitre courant : ${ctx.chapter}.` : '',
    ctx.level ? `Niveau de l'apprenant dans ce langage : ${ctx.level}.` : '',
    ctx.exercise ? `Exercice en cours :\n${ctx.exercise}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
