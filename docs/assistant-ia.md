# Assistant pédagogique

L’assistant (bulle de Kiri, en bas à droite) connaît toujours le **contexte** : chapitre, exercice, langage, niveau de l’apprenant, dernier code et dernière erreur.

## Sans IA (par défaut)

Codemori fonctionne entièrement sans modèle de langage :

- **indices en 3 niveaux** : deux indices rédigés par exercice, puis une aide structurée (démarche, notions, extrait de la théorie) ;
- **explication des erreurs** de compilation et d’exécution : base de règles pour rustc, g++ et javac (erreurs d’emprunt, types, symboles inconnus, segmentation, exceptions Java…) avec la ligne concernée et une piste de correction ;
- **reformulation** et **rappels de cours** tirés du chapitre et du glossaire ;
- **comparaison entre langages** pour les notions du glossaire (ex. `Option` / `std::optional` / `Optional`) ;
- **exercices de révision** tirés de la banque existante sur les notions ratées.

## Avec une API compatible OpenAI

Toute API exposant `/v1/chat/completions` convient (OpenAI, Mistral, Groq, OpenRouter, LM Studio, vLLM…) :

```env
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-…
AI_MODEL=gpt-4o-mini
```

## Avec Ollama (modèle local, aucune donnée ne sort du serveur)

```env
AI_PROVIDER=ollama
AI_BASE_URL=http://ollama:11434
AI_MODEL=qwen2.5-coder:7b
```

```bash
docker compose --profile ai up -d
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

Un modèle de 7 milliards de paramètres demande environ 8 Go de RAM (ou un GPU).

## Garde-fous

- L’IA reçoit une consigne pédagogique stricte : **ne pas donner la solution complète**, guider par questions et indices, répondre en français, au niveau de l’apprenant.
- Les solutions et tests cachés ne lui sont jamais transmis.
- En cas d’indisponibilité ou d’erreur du fournisseur, l’assistant bascule automatiquement sur le mode sans IA.
- L’administrateur peut désactiver l’IA à tout moment (paramètre `aiEnabled`).
- Les exercices générés par l’IA sont des QCM de révision, validés structurellement avant affichage.
