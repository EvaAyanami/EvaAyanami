#!/usr/bin/env python3
"""Génère apps/web/src/locales/{en,de,es}.ts depuis les tables ui_*.py et signale les clés manquantes."""
import importlib.util, json, re, glob, sys, os
HERE = os.path.dirname(__file__)
T = {}
for f in sorted(glob.glob(os.path.join(HERE, 'ui_*.py'))):
    spec = importlib.util.spec_from_file_location('m', f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    T.update(m.T)
SRC = os.path.join(HERE, '../../apps/web/src')
keys = set()
for f in glob.glob(SRC + '/**/*.ts*', recursive=True):
    s = open(f, encoding='utf-8').read()
    for lit in re.findall(r"""\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')""", s):
        keys.add(json.loads(lit) if lit[0] == '"' else lit[1:-1].replace("\\'", "'"))
missing = sorted(k for k in keys if k not in T)
for i, (code, name) in enumerate([('en', 'EN'), ('de', 'DE'), ('es', 'ES')]):
    lines = [f"/** Traductions ({code}) générées par tools/i18n/build.py — clé = texte français. */", f"export const {name}: Record<string, string> = {{"]
    for k in sorted(T):
        lines.append(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(T[k][i], ensure_ascii=False)},")
    lines.append("};\n")
    open(os.path.join(SRC, 'locales', f'{code}.ts'), 'w', encoding='utf-8').write('\n'.join(lines))
print(f"{len(T)} traductions, {len(keys)} clés utilisées, {len(missing)} manquantes")
for k in missing: print('  MANQUANTE :', k)
