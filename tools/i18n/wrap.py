#!/usr/bin/env python3
"""
Codemod de traduction : entoure les textes français de l'interface par t(…).

- texte JSX entre balises :            <p>Bonjour</p>           → <p>{t("Bonjour")}</p>
- attributs placeholder/title/aria-label : placeholder="Nom"    → placeholder={t("Nom")}
- premier argument de toast('…')                                 → toast(t('…'))

Les blocs <pre>, <code>, <style>, <svg> et les fichiers de dessin sont ignorés.
Usage : wrap.py [--dry] fichiers…   (affiche les textes trouvés)
"""
import json, re, sys

DRY = '--dry' in sys.argv
files = [f for f in sys.argv[1:] if not f.startswith('--')]

LETTER = re.compile(r"[A-Za-zÀ-ÿ]{2,}")
TEXT = re.compile(r"(?<![=\-])>([^<>{}]*?)<(?=[A-Za-z/])")
ATTR = re.compile(r'\b(placeholder|title|aria-label)="([^"{}]*[A-Za-zÀ-ÿ][^"{}]*)"')
TOAST = re.compile(r"\btoast\((['\"])((?:(?!\1).)+)\1")
SKIP_BLOCK = re.compile(r"<(pre|code|style|svg|text|textarea)\b[\s\S]*?</\1>")

def wanted(s: str) -> bool:
    s = s.strip()
    if not s or not LETTER.search(s):
        return False
    if re.fullmatch(r"[\w.\-/#@:]+", s) and not re.search(r"[À-ÿ ]", s) and s[:1].islower():
        return False  # identifiants, chemins, classes
    if s.startswith(('http', '/', '#')) or s.startswith('//'):
        return False
    if re.search(r"[;={}]|=>|&&|\|\||^\s*[):,;.]|\?\s*\(|\bconst\b|\breturn\b", s):
        return False
    return True

found = set()
for path in files:
    src = open(path, encoding='utf-8').read()
    # masquer les blocs ignorés
    masks = []
    def mask(m):
        masks.append(m.group(0))
        return f"\x00{len(masks) - 1}\x00"
    work = SKIP_BLOCK.sub(mask, src)

    def rep_text(m):
        raw = m.group(1)
        if not wanted(raw):
            return m.group(0)
        lead = raw[: len(raw) - len(raw.lstrip())]
        trail = raw[len(raw.rstrip()):]
        core = raw.strip()
        if '\n' in core:
            core = re.sub(r"\s*\n\s*", " ", core)
        found.add(core)
        return f">{lead}{{t({json.dumps(core, ensure_ascii=False)})}}{trail}<"

    # seulement dans le JSX : on n'agit que sur les lignes contenant des balises
    work = TEXT.sub(rep_text, work)
    work = ATTR.sub(lambda m: (found.add(m.group(2)), f'{m.group(1)}={{t({json.dumps(m.group(2), ensure_ascii=False)})}}')[1], work)
    work = TOAST.sub(lambda m: (found.add(m.group(2)), f"toast(t({m.group(1)}{m.group(2)}{m.group(1)})")[1], work)

    out = re.sub(r"\x00(\d+)\x00", lambda m: masks[int(m.group(1))], work)
    if out != src and not DRY:
        if not re.search(r"import \{[^}]*\bt\b[^}]*\} from '[./]*lib/i18n'", out) and "from '../lib/i18n'" not in out and "from './i18n'" not in out:
            depth = (path.split('src/')[1] if 'src/' in path else path).count('/')
            rel = ('../' * depth) + 'lib/i18n' if depth else './lib/i18n'
            if path.endswith('lib/plan.tsx') or path.endswith('lib/feedback.tsx'):
                rel = './i18n'
            # après le dernier import
            imports = list(re.finditer(r"^import [^;]+;\n", out, re.M))
            pos = imports[-1].end() if imports else 0
            out = out[:pos] + f"import {{ t }} from '{rel}';\n" + out[pos:]
        open(path, 'w', encoding='utf-8').write(out)

if DRY:
    for s in sorted(found):
        print(s)
print(f"{len(found)} textes", file=sys.stderr)
