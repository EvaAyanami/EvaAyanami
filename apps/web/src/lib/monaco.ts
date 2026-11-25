/**
 * Configuration de Monaco Editor, hébergé localement (aucun CDN) :
 * thèmes Codemori, autocomplétion de base et extraits de code par langage.
 */
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import { loader } from '@monaco-editor/react';

(self as any).MonacoEnvironment = {
  getWorker: (_: string, label: string) => (label === 'html' ? new htmlWorker() : label === 'css' ? new cssWorker() : new editorWorker()),
};
loader.config({ monaco });

monaco.editor.defineTheme('codemori-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '8fb3ff', fontStyle: 'bold' },
    { token: 'string', foreground: '7ee2b8' },
    { token: 'number', foreground: 'f9b97a' },
    { token: 'comment', foreground: '6f7ba0', fontStyle: 'italic' },
    { token: 'type', foreground: 'c4b5fd' },
    { token: 'identifier', foreground: 'e6e9f5' },
  ],
  colors: {
    'editor.background': '#131726',
    'editor.lineHighlightBackground': '#1c2236',
    'editorLineNumber.foreground': '#4a5470',
    'editorLineNumber.activeForeground': '#93b5ff',
    'editor.selectionBackground': '#2f55e055',
    'editorCursor.foreground': '#22d3ee',
  },
});
monaco.editor.defineTheme('codemori-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '2f55e0', fontStyle: 'bold' },
    { token: 'string', foreground: '0f8a5f' },
    { token: 'number', foreground: 'c2610c' },
    { token: 'comment', foreground: '8f9bb8', fontStyle: 'italic' },
    { token: 'type', foreground: '7c3aed' },
  ],
  colors: {
    'editor.background': '#fbfcff',
    'editor.lineHighlightBackground': '#eef4ff',
    'editorLineNumber.foreground': '#a7b1c9',
    'editorLineNumber.activeForeground': '#2f55e0',
    'editorCursor.foreground': '#2f55e0',
  },
});

type Snip = [label: string, insert: string, doc: string];
const SNIPPETS: Record<string, Snip[]> = {
  rust: [
    ['println!', 'println!("${1:{}}", ${2:valeur});', 'Affiche une ligne'],
    ['fn', 'fn ${1:nom}(${2}) -> ${3:()} {\n\t$0\n}', 'Déclare une fonction'],
    ['main', 'fn main() {\n\t$0\n}', 'Fonction principale'],
    ['for', 'for ${1:i} in ${2:0..10} {\n\t$0\n}', 'Boucle for'],
    ['while', 'while ${1:condition} {\n\t$0\n}', 'Boucle while'],
    ['loop', 'loop {\n\t$0\n}', 'Boucle infinie'],
    ['if', 'if ${1:condition} {\n\t$0\n}', 'Condition'],
    ['match', 'match ${1:valeur} {\n\t${2:motif} => ${3:expr},\n\t_ => ${4:expr},\n}', 'Filtrage par motif'],
    ['struct', 'struct ${1:Nom} {\n\t${2:champ}: ${3:Type},\n}', 'Structure'],
    ['impl', 'impl ${1:Nom} {\n\t$0\n}', 'Bloc impl'],
    ['enum', 'enum ${1:Nom} {\n\t${2:Variante},\n}', 'Énumération'],
    ['let mut', 'let mut ${1:x} = ${2:0};', 'Variable mutable'],
    ['vec!', 'vec![${1}]', 'Vecteur'],
    ['readline', 'let mut ligne = String::new();\nstd::io::stdin().read_line(&mut ligne).unwrap();\nlet ${1:n}: ${2:i32} = ligne.trim().parse().unwrap();', 'Lire une ligne au clavier'],
    ['readall', 'use std::io::Read;\nlet mut entree = String::new();\nstd::io::stdin().read_to_string(&mut entree).unwrap();', 'Lire toute l’entrée'],
  ],
  cpp: [
    ['cout', 'std::cout << ${1:valeur} << std::endl;', 'Affiche une valeur'],
    ['cin', 'std::cin >> ${1:variable};', 'Lit une valeur'],
    ['main', 'int main() {\n\t$0\n\treturn 0;\n}', 'Fonction principale'],
    ['include', '#include <${1:iostream}>', 'Inclusion'],
    ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}', 'Boucle for'],
    ['forr', 'for (const auto& ${1:x} : ${2:conteneur}) {\n\t$0\n}', 'Boucle sur un conteneur'],
    ['while', 'while (${1:condition}) {\n\t$0\n}', 'Boucle while'],
    ['if', 'if (${1:condition}) {\n\t$0\n}', 'Condition'],
    ['class', 'class ${1:Nom} {\npublic:\n\t${1:Nom}() {}\nprivate:\n\t$0\n};', 'Classe'],
    ['struct', 'struct ${1:Nom} {\n\t$0\n};', 'Structure'],
    ['vector', 'std::vector<${1:int}> ${2:v};', 'Vecteur'],
    ['getline', 'std::string ${1:ligne};\nstd::getline(std::cin, ${1:ligne});', 'Lire une ligne'],
  ],
  java: [
    ['sout', 'System.out.println(${1});', 'Affiche une ligne'],
    ['main', 'public static void main(String[] args) {\n\t$0\n}', 'Méthode principale'],
    ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}', 'Boucle for'],
    ['foreach', 'for (${1:var} ${2:x} : ${3:collection}) {\n\t$0\n}', 'Boucle for-each'],
    ['while', 'while (${1:condition}) {\n\t$0\n}', 'Boucle while'],
    ['if', 'if (${1:condition}) {\n\t$0\n}', 'Condition'],
    ['class', 'class ${1:Nom} {\n\t$0\n}', 'Classe'],
    ['scanner', 'Scanner sc = new Scanner(System.in);', 'Lecteur clavier (import java.util.Scanner)'],
    ['nextInt', 'int ${1:n} = sc.nextInt();', 'Lire un entier'],
    ['list', 'List<${1:Integer}> ${2:liste} = new ArrayList<>();', 'Liste'],
    ['map', 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', 'Dictionnaire'],
    ['trycatch', 'try {\n\t$0\n} catch (${1:Exception} e) {\n\t\n}', 'Bloc try/catch'],
  ],
  python: [
    ['print', 'print(${1:valeur})', 'Affiche une valeur'],
    ['input', '${1:n} = int(input())', 'Lit un entier'],
    ['def', 'def ${1:nom}(${2}):\n\t${0:pass}', 'Déclare une fonction'],
    ['for', 'for ${1:i} in range(${2:10}):\n\t$0', 'Boucle for'],
    ['while', 'while ${1:condition}:\n\t$0', 'Boucle while'],
    ['if', 'if ${1:condition}:\n\t$0', 'Condition'],
    ['class', 'class ${1:Nom}:\n\tdef __init__(self${2}):\n\t\t$0', 'Classe'],
    ['main', 'def main():\n\t$0\n\n\nif __name__ == "__main__":\n\tmain()', 'Point d’entrée'],
    ['lines', 'import sys\nlignes = sys.stdin.read().splitlines()', 'Lire toute l’entrée'],
  ],
  php: [
    ['echo', 'echo ${1:\\$valeur}, "\\n";', 'Affiche une valeur'],
    ['php', '<?php\ndeclare(strict_types=1);\n\n$0', 'Début de fichier PHP'],
    ['function', 'function ${1:nom}(${2}): ${3:void}\n{\n\t$0\n}', 'Déclare une fonction'],
    ['foreach', 'foreach (${1:\\$tableau} as ${2:\\$valeur}) {\n\t$0\n}', 'Parcourt un tableau'],
    ['if', 'if (${1:condition}) {\n\t$0\n}', 'Condition'],
    ['class', 'class ${1:Nom}\n{\n\tpublic function __construct(${2})\n\t{\n\t\t$0\n\t}\n}', 'Classe'],
    ['readline', '\\$${1:n} = (int) trim(fgets(STDIN));', 'Lit un entier'],
  ],
  html: [
    ['html5', '<!DOCTYPE html>\n<html lang="fr">\n<head>\n\t<meta charset="UTF-8">\n\t<title>${1:Ma page}</title>\n\t<style>\n\t\t$2\n\t</style>\n</head>\n<body>\n\t$0\n</body>\n</html>', 'Squelette HTML5'],
    ['a', '<a href="${1:https://}">${2:lien}</a>', 'Lien'],
    ['img', '<img src="${1}" alt="${2:description}">', 'Image'],
    ['ul', '<ul>\n\t<li>$0</li>\n</ul>', 'Liste à puces'],
    ['flex', 'display: flex;\ngap: ${1:1rem};\nalign-items: ${2:center};', 'Conteneur Flexbox'],
    ['grid', 'display: grid;\ngrid-template-columns: ${1:repeat(3, 1fr)};\ngap: ${2:1rem};', 'Conteneur Grid'],
  ],
};

for (const [lang, snips] of Object.entries(SNIPPETS)) {
  monaco.languages.registerCompletionItemProvider(lang, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      return {
        suggestions: snips.map(([label, insertText, documentation]) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText,
          documentation,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });
}

export { monaco };
