# Générateurs des projets

Les fichiers `content/projects/*.yaml` sont produits par ces scripts Python (les solutions dans
les trois langages y sont écrites sous forme de blocs de code, ce qui évite les erreurs d'échappement YAML).

```bash
pip install pyyaml
python3 tools/content-gen/proj_debutant.py content/projects/1-debutant.yaml
python3 tools/content-gen/proj_inter.py    content/projects/3-intermediaire-a.yaml
python3 tools/content-gen/proj_inter2.py   content/projects/3-intermediaire-b.yaml
python3 tools/content-gen/proj_avance.py   content/projects/4-avance-a.yaml
python3 tools/content-gen/proj_avance2.py  content/projects/4-avance-b.yaml
python3 tools/content-gen/proj_avance3.py  content/projects/4-avance-c.yaml
python3 tools/content-gen/proj_expert.py   content/projects/5-expertise-a.yaml
python3 tools/content-gen/proj_expert2.py  content/projects/5-expertise-b.yaml
```

Après régénération, vérifie toujours les solutions avec le service d'exécution :

```bash
cd apps/api && RUNNER_URL=http://localhost:4100 npx tsx src/scripts/verify-content.ts --filter <prefixe>
```

Les YAML peuvent aussi être édités à la main (ou via le panneau d'administration) : les scripts
ne sont qu'une commodité.
