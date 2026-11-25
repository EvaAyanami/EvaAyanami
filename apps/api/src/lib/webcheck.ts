/**
 * Correction des exercices HTML/CSS : le document est analysé (DOM + feuilles de
 * style), jamais exécuté. Aucun script n'est lancé côté serveur.
 */
import { parseHTML } from 'linkedom';
import type { WebCheck } from './content.js';

export interface WebCheckResult {
  message: string;
  passed: boolean;
}

interface CssRule {
  selectors: string[];
  decls: Map<string, string>;
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*([,(])\s*/g, '$1').replace(/\s*\)/g, ')').replace(/\s*!important$/, '');

/** Extrait les règles CSS (les blocs @media / @supports sont aplatis). */
export function parseCss(css: string): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let i = 0;
  const parseBlock = (end: number) => {
    while (i < end) {
      const open = src.indexOf('{', i);
      if (open === -1 || open >= end) return;
      const head = src.slice(i, open).trim();
      // trouver l'accolade fermante correspondante
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      if (head.startsWith('@')) {
        if (/^@(media|supports|layer|container)/.test(head)) {
          const save = i;
          i = open + 1;
          parseBlock(j - 1);
          i = save;
        }
      } else if (head) {
        const decls = new Map<string, string>();
        for (const d of body.split(';')) {
          const k = d.indexOf(':');
          if (k > 0) decls.set(d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim());
        }
        rules.push({ selectors: head.split(',').map((x) => x.trim()).filter(Boolean), decls });
      }
      i = j;
    }
  };
  parseBlock(src.length);
  return rules;
}

/** Valeur d'une propriété appliquée à un élément : style en ligne puis règles qui le ciblent (la dernière l'emporte). */
function styleOf(el: Element, rules: CssRule[], prop: string): string | null {
  const inline = (el.getAttribute('style') ?? '').split(';').map((d) => d.split(':')).find(([k]) => k?.trim().toLowerCase() === prop);
  if (inline && inline[1] !== undefined) return inline.slice(1).join(':').trim();
  let found: string | null = null;
  for (const r of rules) {
    if (!r.decls.has(prop)) continue;
    if (
      r.selectors.some((s) => {
        try {
          return el.matches(s.replace(/::?(before|after|hover|focus|active|visited|first-letter|first-line|focus-visible|focus-within)\b/g, ''));
        } catch {
          return false;
        }
      })
    )
      found = r.decls.get(prop)!;
  }
  // Propriétés raccourcies courantes : margin/padding/border… acceptées si la propriété longue est absente.
  if (found === null) {
    const short = prop.split('-')[0];
    if (short !== prop) for (const r of rules) if (r.decls.has(short) && r.selectors.some((s) => safeMatches(el, s))) found = r.decls.get(short)!;
  }
  return found;
}
const safeMatches = (el: Element, s: string) => {
  try {
    return el.matches(s);
  } catch {
    return false;
  }
};

export function runWebChecks(html: string, checks: WebCheck[]): WebCheckResult[] {
  const doc = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
  const { document } = parseHTML(doc);
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  const rules = parseCss(css);
  const q = (sel?: string) => {
    if (!sel) return [] as Element[];
    try {
      return [...document.querySelectorAll(sel)] as Element[];
    } catch {
      return [] as Element[];
    }
  };
  return checks.map((c) => {
    const els = q(c.selector);
    let passed = false;
    switch (c.type) {
      case 'doctype':
        passed = /^\s*<!doctype html>/i.test(html);
        break;
      case 'lang':
        passed = !!document.documentElement?.getAttribute('lang') && (!c.value || document.documentElement.getAttribute('lang') === c.value);
        break;
      case 'exists':
        passed = els.length > 0;
        break;
      case 'absent':
        passed = els.length === 0;
        break;
      case 'count':
        passed = els.length >= (c.min ?? 0) && els.length <= (c.max ?? Infinity);
        break;
      case 'text':
        passed = els.some((e) => (e.textContent ?? '').replace(/\s+/g, ' ').toLowerCase().includes(String(c.contains ?? '').toLowerCase()));
        break;
      case 'attr':
        passed = els.some((e) => e.hasAttribute(c.name!) && (c.value === undefined || (c.value === '*' ? !!e.getAttribute(c.name!)?.trim() : e.getAttribute(c.name!) === c.value)));
        break;
      case 'css': {
        const prop = (c.property ?? '').toLowerCase();
        passed = els.some((e) => {
          const v = styleOf(e, rules, prop);
          if (v === null) return false;
          if (c.value === undefined || c.value === '*') return true;
          const want = norm(String(c.value));
          return want.startsWith('/') && want.endsWith('/') ? new RegExp(want.slice(1, -1), 'i').test(v) : norm(v) === want || norm(v).split(' ').includes(want);
        });
        break;
      }
    }
    return { message: c.message, passed };
  });
}
