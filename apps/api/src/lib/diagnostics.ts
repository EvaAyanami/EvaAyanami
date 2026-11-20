/**
 * Analyse des erreurs de compilation et d'exécution, avec explications
 * pédagogiques en français. Fonctionne sans IA.
 */

export interface Diagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  code?: string;
}

export interface Explanation {
  title: string;
  explanation: string;
  tip: string;
}

/** Extrait les diagnostics (ligne/colonne) depuis la sortie du compilateur. */
export function parseDiagnostics(language: string, stderr: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = stderr.split('\n');
  if (language === 'rust') {
    // error[E0382]: borrow of moved value: `s`
    //   --> main.rs:5:20
    for (let i = 0; i < lines.length; i++) {
      const m = /^(error|warning)(?:\[(E\d+)\])?: (.*)$/.exec(lines[i]);
      if (!m) continue;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const loc = /-->\s*main\.rs:(\d+):(\d+)/.exec(lines[j]);
        if (loc) {
          out.push({ severity: m[1] as 'error' | 'warning', code: m[2], message: m[3], line: +loc[1], column: +loc[2] });
          break;
        }
      }
    }
  } else if (language === 'cpp') {
    for (const l of lines) {
      const m = /^main\.cpp:(\d+):(\d+): (error|warning|fatal error): (.*)$/.exec(l);
      if (m) out.push({ line: +m[1], column: +m[2], severity: m[3] === 'warning' ? 'warning' : 'error', message: m[4] });
    }
  } else if (language === 'java') {
    for (const l of lines) {
      const m = /^Main\.java:(\d+): (error|warning): (.*)$/.exec(l);
      if (m) out.push({ line: +m[1], column: 1, severity: m[2] as 'error' | 'warning', message: m[3] });
    }
  }
  return out.slice(0, 50);
}

type Rule = { re: RegExp } & Explanation;

const RUST: Rule[] = [
  {
    re: /E0382|use of moved value|borrow of moved value/,
    title: 'Valeur déplacée (move)',
    explanation:
      "En Rust, chaque valeur a un seul propriétaire. Quand tu passes une `String` ou un `Vec` à une fonction ou à une autre variable, la propriété est **déplacée** : l'ancienne variable n'est plus utilisable.",
    tip: 'Passe une référence (`&valeur`) si la fonction doit seulement lire la donnée, ou utilise `.clone()` si tu as vraiment besoin d’une copie.',
  },
  {
    re: /E0499|cannot borrow .* as mutable more than once/,
    title: 'Deux emprunts mutables simultanés',
    explanation: "Rust interdit d'avoir deux références mutables (`&mut`) vers la même donnée au même moment : cela pourrait créer des accès concurrents incohérents.",
    tip: 'Réduis la portée du premier emprunt (bloc `{ }`) ou réorganise le code pour que les deux emprunts ne se chevauchent pas.',
  },
  {
    re: /E0502|cannot borrow .* as (im)?mutable because it is also borrowed/,
    title: 'Conflit entre emprunt partagé et emprunt mutable',
    explanation: "Tant qu'une référence partagée (`&`) est utilisée, la donnée ne peut pas être modifiée via une référence mutable (`&mut`), et inversement.",
    tip: "Termine d'utiliser la référence en lecture avant de modifier la donnée, ou copie la valeur dont tu as besoin.",
  },
  {
    re: /E0384|cannot assign twice to immutable variable/,
    title: 'Variable immuable',
    explanation: 'Par défaut, les variables Rust sont **immuables** : une fois une valeur assignée, on ne peut plus la changer.',
    tip: 'Déclare la variable avec `let mut` si tu dois la modifier.',
  },
  {
    re: /E0596|cannot borrow .* as mutable, as it is not declared as mutable/,
    title: 'Emprunt mutable d’une variable immuable',
    explanation: 'Tu essaies de modifier (ou d’emprunter en `&mut`) une variable déclarée sans `mut`.',
    tip: 'Ajoute `mut` à la déclaration : `let mut v = ...`.',
  },
  {
    re: /E0308|mismatched types/,
    title: 'Types incompatibles',
    explanation: "Le compilateur attendait un type et en a reçu un autre. Rust ne fait (presque) aucune conversion implicite : `i32` et `i64`, `&str` et `String` sont des types différents.",
    tip: 'Lis la ligne « expected … found … ». Utilise `as` pour les nombres, `.to_string()` ou `&s` pour les chaînes. Vérifie aussi un `;` en trop à la fin d’une fonction qui doit retourner une valeur.',
  },
  {
    re: /E0425|cannot find value|cannot find function/,
    title: 'Nom introuvable',
    explanation: "Tu utilises une variable ou une fonction qui n'existe pas dans cette portée (faute de frappe, variable déclarée dans un autre bloc, ou oubli de `use`).",
    tip: 'Vérifie l’orthographe et l’endroit où la variable est déclarée : une variable déclarée dans un bloc `{ }` disparaît à la fin du bloc.',
  },
  {
    re: /E0599|no method named/,
    title: 'Méthode inexistante',
    explanation: "Le type de la valeur ne possède pas cette méthode. C'est souvent un trait non importé ou un mauvais type (par ex. `Option<T>` au lieu de `T`).",
    tip: "Vérifie le type exact de la valeur. Pour un `Option` ou un `Result`, extrais d'abord la valeur (`match`, `if let`, `?`).",
  },
  {
    re: /E0106|missing lifetime specifier/,
    title: 'Durée de vie manquante',
    explanation: 'Une fonction retourne une référence mais Rust ne peut pas deviner de quelle entrée elle provient.',
    tip: "Ajoute un paramètre de durée de vie : `fn f<'a>(x: &'a str, y: &'a str) -> &'a str`, ou retourne une valeur possédée (`String`).",
  },
  {
    re: /E0597|does not live long enough/,
    title: 'Valeur détruite trop tôt',
    explanation: 'Une référence survit à la valeur qu’elle pointe : la valeur est libérée à la fin de son bloc alors que la référence est encore utilisée.',
    tip: 'Déclare la valeur dans une portée plus large, ou stocke une valeur possédée plutôt qu’une référence.',
  },
  {
    re: /E0277/,
    title: 'Trait non implémenté',
    explanation: "Le type utilisé n'implémente pas le trait requis (par ex. `Display` pour `{}`, `Debug` pour `{:?}`, `Copy`, `Send`…).",
    tip: 'Ajoute `#[derive(Debug)]`, implémente le trait, ou utilise un type qui le possède. Pour afficher une struct, `{:?}` + `#[derive(Debug)]` est le plus simple.',
  },
  {
    re: /E0004|non-exhaustive patterns/,
    title: 'Match non exhaustif',
    explanation: '`match` doit couvrir **tous** les cas possibles de la valeur.',
    tip: 'Ajoute les variantes manquantes ou un bras générique `_ => ...`.',
  },
  {
    re: /E0433|failed to resolve/,
    title: 'Chemin introuvable',
    explanation: "Un module, un type ou une crate n'a pas été trouvé.",
    tip: 'Vérifie les `use` en haut du fichier (par ex. `use std::collections::HashMap;`).',
  },
  {
    re: /expected `;`|expected one of .*;/,
    title: 'Point-virgule manquant',
    explanation: 'Une instruction n’est pas terminée par `;`.',
    tip: 'Ajoute `;` à la fin de la ligne indiquée (ou de la ligne précédente).',
  },
  {
    re: /index out of bounds/,
    title: 'Indice hors limites (panic)',
    explanation: "Le programme a accédé à un élément d'un tableau ou d'un vecteur au-delà de sa taille. Rust vérifie les indices et arrête le programme (`panic`).",
    tip: 'Les indices vont de `0` à `len() - 1`. Utilise `.get(i)` qui renvoie un `Option` si tu n’es pas sûr.',
  },
  {
    re: /attempt to (add|subtract|multiply) with overflow/,
    title: 'Dépassement arithmétique',
    explanation: "Le résultat d'une opération ne tient pas dans le type entier utilisé (par ex. `u32` négatif).",
    tip: 'Utilise un type plus grand (`i64`), ou `checked_add`, `wrapping_add`, `saturating_sub`.',
  },
  {
    re: /called `Option::unwrap\(\)` on a `None` value|called `Result::unwrap\(\)` on an `Err`/,
    title: 'unwrap() sur une valeur absente',
    explanation: "`unwrap()` arrête le programme si l'`Option` vaut `None` ou si le `Result` est une `Err`.",
    tip: 'Gère le cas d’erreur avec `match`, `if let`, `unwrap_or(…)` ou l’opérateur `?`.',
  },
  {
    re: /ParseIntError|invalid digit found in string/,
    title: 'Conversion de texte en nombre impossible',
    explanation: 'La chaîne lue ne représente pas un nombre valide — souvent à cause du retour à la ligne final.',
    tip: 'Appelle `.trim()` avant `.parse()` : `ligne.trim().parse::<i32>()`.',
  },
];

const CPP: Rule[] = [
  {
    re: /was not declared in this scope/,
    title: 'Identifiant non déclaré',
    explanation: "Tu utilises un nom (variable, fonction, type) que le compilateur ne connaît pas à cet endroit.",
    tip: "Vérifie l'orthographe, l'`#include` nécessaire (`<vector>`, `<string>`…) et le préfixe `std::` (ou `using namespace std;`).",
  },
  {
    re: /expected ';'/,
    title: 'Point-virgule manquant',
    explanation: 'En C++, chaque instruction se termine par `;` — y compris la définition d’une `class` ou d’une `struct` (`};`).',
    tip: 'Ajoute `;` à la fin de la ligne indiquée ou de la précédente.',
  },
  {
    re: /no matching function for call/,
    title: 'Aucune fonction correspondante',
    explanation: 'Les arguments passés ne correspondent à aucune surcharge de la fonction (nombre ou types incorrects).',
    tip: 'Compare les types des arguments avec la signature déclarée. Les « candidates » listées par le compilateur indiquent ce qui est accepté.',
  },
  {
    re: /invalid conversion|cannot convert/,
    title: 'Conversion impossible',
    explanation: 'Une valeur d’un type ne peut pas être convertie implicitement vers le type attendu (par ex. pointeur ↔ entier, `const char*` ↔ `int`).',
    tip: 'Vérifie le type attendu ; utilise `static_cast<T>(x)` pour une conversion explicite et légitime.',
  },
  {
    re: /undefined reference to/,
    title: 'Référence indéfinie (édition de liens)',
    explanation: "Une fonction est déclarée mais jamais définie (son corps manque), ou `main` est absente.",
    tip: 'Écris le corps de la fonction déclarée, et vérifie que `int main()` existe.',
  },
  {
    re: /discards qualifiers|passing 'const/,
    title: 'Violation de const',
    explanation: "Tu appelles une méthode non `const` sur un objet `const`, ou tu modifies une valeur `const`.",
    tip: 'Marque la méthode `const` si elle ne modifie pas l’objet : `int get() const { … }`.',
  },
  {
    re: /is private within this context/,
    title: 'Membre privé',
    explanation: "Tu accèdes à un membre `private` depuis l'extérieur de la classe.",
    tip: 'Passe par une méthode publique (accesseur) ou rends le membre `public` si c’est justifié.',
  },
  {
    re: /use of deleted function/,
    title: 'Fonction supprimée',
    explanation: "Une fonction a été supprimée (`= delete`), typiquement le constructeur de copie d'un `std::unique_ptr` ou d'un `std::thread`.",
    tip: 'Utilise `std::move(x)` pour transférer la propriété au lieu de copier.',
  },
  {
    re: /control reaches end of non-void function/,
    title: 'Retour manquant',
    explanation: "Une fonction qui doit retourner une valeur peut se terminer sans `return`.",
    tip: 'Ajoute un `return` dans tous les chemins d’exécution.',
  },
  {
    re: /expected primary-expression|expected unqualified-id/,
    title: 'Syntaxe invalide',
    explanation: "Le compilateur a rencontré un symbole inattendu : parenthèse ou accolade mal placée, mot-clé mal orthographié…",
    tip: 'Regarde la ligne indiquée et la précédente : il manque souvent `)`, `}` ou `;`.',
  },
  {
    re: /Segmentation fault|SIGSEGV|exit code 139/,
    title: 'Erreur de segmentation',
    explanation: "Le programme a accédé à une zone mémoire interdite : pointeur nul, pointeur libéré (dangling), indice hors limites…",
    tip: 'Vérifie les indices (`v.at(i)` lève une exception au lieu de planter), initialise tes pointeurs et préfère les pointeurs intelligents.',
  },
  {
    re: /std::out_of_range/,
    title: 'Indice hors limites',
    explanation: '`at()` a détecté un accès au-delà de la taille du conteneur.',
    tip: 'Les indices valides vont de `0` à `size() - 1`.',
  },
  {
    re: /comparison of integer expressions of different signedness/,
    title: 'Comparaison signé / non signé (avertissement)',
    explanation: '`v.size()` est un `size_t` (non signé) ; le comparer à un `int` peut donner des résultats surprenants avec des valeurs négatives.',
    tip: 'Utilise `size_t` pour l’indice ou une boucle `for (auto& x : v)`.',
  },
];

const JAVA: Rule[] = [
  {
    re: /cannot find symbol/,
    title: 'Symbole introuvable',
    explanation: "Java ne connaît pas ce nom : variable non déclarée, faute de frappe, méthode inexistante ou `import` manquant.",
    tip: 'Vérifie l’orthographe (Java distingue majuscules et minuscules) et ajoute l’`import` nécessaire (`java.util.*`).',
  },
  {
    re: /';' expected/,
    title: 'Point-virgule manquant',
    explanation: 'Chaque instruction Java se termine par `;`.',
    tip: 'Ajoute `;` à la fin de la ligne indiquée.',
  },
  {
    re: /incompatible types/,
    title: 'Types incompatibles',
    explanation: 'La valeur n’a pas le type attendu (par ex. `double` vers `int`, `String` vers `int`).',
    tip: 'Pour convertir un texte en nombre : `Integer.parseInt(s)`. Pour réduire un `double` : `(int) x` (cast explicite).',
  },
  {
    re: /missing return statement/,
    title: 'Retour manquant',
    explanation: 'La méthode déclare un type de retour mais certains chemins ne retournent rien.',
    tip: 'Ajoute un `return` à la fin de la méthode ou dans chaque branche.',
  },
  {
    re: /is public, should be declared in a file named/,
    title: 'Nom de classe et nom de fichier différents',
    explanation: 'Une classe `public` doit porter le même nom que son fichier. Ici le fichier est `Main.java`.',
    tip: 'Nomme ta classe principale `public class Main`.',
  },
  {
    re: /unreported exception/,
    title: 'Exception vérifiée non gérée',
    explanation: 'Cette méthode peut lever une exception vérifiée (checked) : Java oblige à la traiter.',
    tip: 'Entoure l’appel d’un `try { … } catch (… e) { … }` ou ajoute `throws …` à la signature.',
  },
  {
    re: /might not have been initialized/,
    title: 'Variable non initialisée',
    explanation: 'Une variable locale est lue avant d’avoir reçu une valeur dans tous les cas.',
    tip: 'Initialise-la lors de sa déclaration (`int total = 0;`).',
  },
  {
    re: /non-static (method|variable) .* cannot be referenced from a static context/,
    title: 'Accès depuis un contexte statique',
    explanation: "`main` est `static` : il ne peut pas utiliser directement des méthodes ou attributs d'instance.",
    tip: 'Déclare la méthode `static`, ou crée un objet (`new Main()`) pour l’appeler.',
  },
  {
    re: /does not override abstract method|is not abstract and does not override/,
    title: 'Méthode abstraite non implémentée',
    explanation: 'La classe implémente une interface ou étend une classe abstraite sans définir toutes ses méthodes.',
    tip: 'Implémente chaque méthode requise avec la même signature (et `@Override`).',
  },
  {
    re: /NullPointerException/,
    title: 'NullPointerException',
    explanation: 'Tu as appelé une méthode ou lu un attribut sur une référence qui vaut `null`.',
    tip: 'Initialise l’objet avant usage, ou vérifie `if (x != null)`. `Optional` aide à rendre l’absence explicite.',
  },
  {
    re: /ArrayIndexOutOfBoundsException|IndexOutOfBoundsException/,
    title: 'Indice hors limites',
    explanation: "L'indice utilisé dépasse la taille du tableau ou de la liste.",
    tip: 'Les indices vont de `0` à `length - 1` (ou `size() - 1`).',
  },
  {
    re: /NumberFormatException/,
    title: 'Conversion de texte en nombre impossible',
    explanation: "La chaîne passée à `Integer.parseInt` n'est pas un nombre valide.",
    tip: 'Nettoie l’entrée avec `.trim()` et vérifie qu’elle contient bien des chiffres.',
  },
  {
    re: /StackOverflowError/,
    title: 'Débordement de pile',
    explanation: 'Une récursion ne s’arrête jamais (ou est trop profonde).',
    tip: 'Vérifie le cas de base de ta fonction récursive.',
  },
  {
    re: /OutOfMemoryError/,
    title: 'Mémoire insuffisante',
    explanation: 'Le programme alloue trop de mémoire (liste qui grossit sans fin, par exemple).',
    tip: 'Vérifie les boucles qui ajoutent des éléments et les conditions d’arrêt.',
  },
];

const BY_LANG: Record<string, Rule[]> = { rust: RUST, cpp: CPP, java: JAVA };

export function explainError(language: string, text: string, exitCode?: number): Explanation[] {
  const rules = BY_LANG[language] ?? [];
  const found: Explanation[] = [];
  for (const r of rules) {
    if (r.re.test(text) && !found.some((f) => f.title === r.title)) found.push({ title: r.title, explanation: r.explanation, tip: r.tip });
    if (found.length >= 3) break;
  }
  if (exitCode === 137 || exitCode === 124) {
    found.unshift({
      title: 'Délai dépassé',
      explanation: "Le programme a été arrêté car il a dépassé le temps ou la mémoire autorisés. C'est souvent une boucle infinie ou une lecture d'entrée qui attend des données inexistantes.",
      tip: 'Vérifie la condition de sortie de tes boucles et que la variable de boucle évolue bien à chaque tour.',
    });
  } else if (exitCode === 139 && language !== 'cpp') {
    found.unshift({ title: 'Plantage mémoire', explanation: 'Le programme a été arrêté brutalement (accès mémoire invalide).', tip: 'Vérifie les accès aux tableaux.' });
  } else if (exitCode === 139 && !found.length) {
    found.push(...explainError('cpp', 'Segmentation fault'));
  }
  if (!found.length && text.trim()) {
    found.push({
      title: 'Erreur détectée',
      explanation: 'Lis attentivement le premier message d’erreur : les suivants sont souvent des conséquences du premier.',
      tip: 'Regarde la ligne indiquée et celle juste avant. Corrige une erreur à la fois puis recompile.',
    });
  }
  return found;
}
