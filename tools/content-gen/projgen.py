"""Aide à la génération des fichiers content/projects/*.yaml (blocs littéraux propres)."""
import textwrap
import yaml


class Lit(str):
    pass


def _lit(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')


def _str(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)


yaml.SafeDumper.add_representer(Lit, _lit)
yaml.SafeDumper.add_representer(str, _str)


def code(s: str) -> str:
    s = textwrap.dedent(s).strip('\n') + '\n'
    # Les blocs littéraux YAML ne tolèrent pas d'espaces en fin de ligne
    return '\n'.join(l.rstrip() for l in s.split('\n'))


STARTERS = {
    'rust': code('''
        use std::io::{self, BufRead};

        fn main() {
            for ligne in io::stdin().lock().lines() {
                let ligne = ligne.unwrap();
                // À toi de jouer !
                let _ = ligne;
            }
        }
    '''),
    'cpp': code('''
        #include <iostream>
        #include <string>
        using namespace std;

        int main() {
            string ligne;
            while (getline(cin, ligne)) {
                // À toi de jouer !
            }
        }
    '''),
    'java': code('''
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                Scanner sc = new Scanner(System.in);
                while (sc.hasNextLine()) {
                    String ligne = sc.nextLine();
                    // À toi de jouer !
                }
            }
        }
    '''),
}


def step(id, title, prompt, tests, rust, cpp, java, hints=(), xp=None, starters=None):
    d = {
        'id': id,
        'title': title,
        'prompt': code(prompt).strip('\n'),
        'hints': list(hints),
        'starters': starters or STARTERS,
        'solutions': {'rust': code(rust), 'cpp': code(cpp), 'java': code(java)},
        'tests': [dict(t) for t in tests],
    }
    if xp:
        d['xp'] = xp
    return d


def T(input, output, hidden=False):
    t = {'input': input, 'output': output}
    if hidden:
        t['hidden'] = True
    return t


def project(slug, level, title, summary, description, objectives, constraints, steps):
    return {
        'slug': slug,
        'level': level,
        'title': title,
        'summary': summary,
        'description': code(description).strip('\n'),
        'objectives': objectives,
        'constraints': constraints,
        'languages': ['rust', 'cpp', 'java'],
        'steps': steps,
    }


def dump(projects, path, header):
    with open(path, 'w') as f:
        f.write(f'# {header}\n# Chaque étape a un énoncé, des tests (dont cachés) et une solution par langage.\n')
        yaml.dump(projects, f, Dumper=yaml.SafeDumper, allow_unicode=True, sort_keys=False, width=1000)
