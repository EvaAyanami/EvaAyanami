# Contenu pédagogique

Tout le contenu vit dans `content/`, au format YAML, et est importé en base au démarrage de l’application (`CONTENT_AUTO_IMPORT=true`). Les éléments modifiés dans l’administration sont marqués « personnalisés » et ne sont pas écrasés, sauf import forcé (`docker compose run --rm app import --force`).

```
content/
├── languages.yaml          langages (nom, couleur, version, fichier principal)
├── achievements.yaml       succès et leurs conditions
├── glossary.yaml           notions (identifiants utilisés par `concepts`)
├── rust/  cpp/  java/      un fichier par niveau (ou demi-niveau)
├── projects/               projets multi-langages
└── placement/              questions du test de positionnement
```

## Chapitres

```yaml
language: rust
level: 2                    # 1 débutant absolu … 5 expertise et projets
chapters:
  - slug: rust-ownership    # identifiant unique (URL)
    title: Ownership
    summary: Une phrase de présentation.
    minutes: 30
    concepts: [ownership]   # notions du glossaire
    sections:               # théorie, en Markdown
      - title: Le principe
        body: |
          Texte, tableaux, blocs de code…
    exercises: [ … ]        # exercices d'entraînement
    project: { … }          # mini-projet (exercice de type code, avec title)
    exam:
      pass: 70              # score minimal (%)
      questions: [ … ]      # au moins 3 questions
```

## Exercices

Champs communs : `id` (minuscules, unique), `type`, `prompt` (Markdown), `title`, `difficulty` (1–3), `concepts`, `hints` (2 indices ; le 3ᵉ niveau d’aide est généré), `explanation` (affichée après réussite), `xp`.

| Type | Champs spécifiques |
|---|---|
| `mcq` | `choices`, `answer` (indice ou liste d’indices), `code` facultatif. Les choix sont présentés mélangés |
| `fill` | `code` avec des trous `{{?}}`, `blanks` (réponses acceptées par trou), `tests` facultatifs (le programme complété est alors compilé) |
| `order` | `lines` dans l’ordre correct (présentées mélangées), `alternatives` facultatives |
| `predict` | `code`, `input` facultatif, `output` attendu |
| `bugfix` | `code` bogué, `bugLines`, `choices` (explications), `answer`, `solution`, `tests` |
| `code` | `starter`, `solution`, `tests`, `require`/`forbid` (`{pattern, message}`) |

Un test : `{ input, output, hidden, match, name }`. `match` vaut `trim` par défaut (espaces de fin de ligne et lignes vides finales ignorés), ou `exact`, `contains`, `regex`.

```yaml
- id: rust-somme-code
  type: code
  title: Somme des entiers
  prompt: Lis des entiers et affiche leur somme.
  starter: |
    fn main() {
    }
  solution: |
    use std::io::Read;
    fn main() {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s).unwrap();
        let t: i64 = s.split_whitespace().map(|x| x.parse::<i64>().unwrap()).sum();
        println!("{}", t);
    }
  tests:
    - { input: 1 2 3, output: '6' }
    - { input: '-5 5', output: '0', hidden: true }
  forbid:
    - { pattern: 'unsafe', message: Pas de code unsafe }
```

## Projets

```yaml
- slug: calculatrice
  level: 1
  title: Calculatrice
  summary: …
  description: |        # cahier des charges (Markdown)
  objectives: [ … ]
  constraints: [ … ]
  languages: [rust, cpp, java]
  steps:
    - id: calc-base
      title: Les quatre opérations
      prompt: …
      hints: [ … ]
      starters: { rust: …, cpp: …, java: … }
      solutions: { rust: …, cpp: …, java: … }
      tests: [ … ]       # communs aux trois langages
      xp: 40
```

Les fichiers `content/projects/*.yaml` sont produits par les scripts de `tools/content-gen/` (plus pratiques pour écrire du code dans trois langages), mais peuvent être édités directement.

## Test de positionnement

`content/placement/<langage>.yaml` : `language`, puis `questions`, chacune étant un exercice avec un champ `level` (1 à 5). Le test commence au niveau déduit du questionnaire, monte d’un niveau après une bonne réponse et descend après une erreur ; le niveau retenu est le plus haut niveau réussi à 50 % ou plus.

## Vérifier le contenu

```bash
npm run content:validate                       # structure, identifiants uniques, références
./scripts/verify-content.sh                    # en production (Docker)
RUNNER_URL=http://localhost:4100 npm run content:verify -- --lang java --filter java-gen
```

La vérification compile et exécute **chaque solution** de référence (exercices, bugfix, mini-projets, examens, projets dans les trois langages), contrôle les sorties des questions `predict` et s’assure que chaque code « bogué » échoue bien à ses tests. Ajoute-la à ta CI avant toute publication de contenu.

## Conseils de rédaction

- Une notion par chapitre, des exemples courts et exécutables.
- Des sorties **déterministes** (pas d’horloge, pas de hasard non initialisé, pas d’ordre de `HashMap`).
- Évite les nombres à virgule dont l’arrondi à l’affichage est ambigu (`x.xx5`).
- Toujours au moins un test caché par exercice de code.
- Un message d’erreur ou un indice doit aider sans donner la solution.
