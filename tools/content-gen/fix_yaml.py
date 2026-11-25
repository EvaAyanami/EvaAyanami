#!/usr/bin/env python3
"""Met entre guillemets les valeurs YAML d'une ligne qui contiennent « : » ou « # »
(typographie française), pour éviter les erreurs d'analyse. Usage : fix_yaml.py fichier.yaml…"""
import re, sys

KEY = re.compile(r"^(\s*(?:-\s+)?)([A-Za-z_][\w-]*):\s(.+)$")

def fix(line: str) -> str:
    m = KEY.match(line)
    if not m:
        return line
    indent, key, val = m.groups()
    v = val.strip()
    if not v or v[0] in "'\"[{|>&*!" or v in ('|', '>'):
        return line
    if ': ' in v or ' #' in v or v.endswith(':'):
        return f"{indent}{key}: '{v.replace(chr(39), chr(39) * 2)}'\n"
    return line

for path in sys.argv[1:]:
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    out, in_block, block_indent = [], False, 0
    for ln in lines:
        stripped = ln.rstrip('\n')
        ind = len(stripped) - len(stripped.lstrip(' '))
        if in_block:
            if stripped.strip() == '' or ind > block_indent:
                out.append(ln)
                continue
            in_block = False
        m = KEY.match(stripped)
        if m and m.group(3).strip() in ('|', '>', '|-', '>-'):
            in_block, block_indent = True, len(m.group(1).rstrip('- ')) if m.group(1).strip() == '' else len(m.group(1))
            block_indent = ind if not m.group(1).strip().startswith('-') else ind + 2
            out.append(ln)
            continue
        out.append(fix(stripped) if m else ln if ln.endswith('\n') else ln)
        if m and not out[-1].endswith('\n'):
            out[-1] += '\n'
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(out)
    print('corrigé :', path)
