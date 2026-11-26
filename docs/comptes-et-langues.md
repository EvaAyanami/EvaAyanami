# Comptes, e-mails, connexion Google/Facebook et langues

## Vérification de l’adresse e-mail

À l’inscription, un lien de confirmation (valable 48 h) est envoyé. Tant que l’adresse n’est pas confirmée, seule la page « Vérifie ta boîte mail » est accessible : on peut y renvoyer l’e-mail ou corriger une adresse mal saisie. La même configuration sert au **mot de passe oublié** (lien valable 1 h).

Il faut un serveur d’envoi (SMTP). Quelques options gratuites ou peu coûteuses :

| Service | Réglages |
|---|---|
| **Brevo** (300 e-mails/jour gratuits) | `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, identifiants SMTP du compte |
| **Gmail** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, ton adresse et un **mot de passe d’application** (validation en deux étapes obligatoire) |
| SMTP de ton hébergeur ou fournisseur d’accès | selon ses indications |

```yaml
SMTP_HOST: smtp-relay.brevo.com
SMTP_PORT: "587"
SMTP_USER: ton-identifiant
SMTP_PASS: ton-mot-de-passe-smtp
SMTP_FROM: "Codemori <no-reply@ton-domaine.fr>"
```

- **Sans SMTP**, la vérification n’est pas imposée (on ne pourrait pas envoyer le lien) et les liens sont écrits dans les journaux du conteneur `app`.
- `REQUIRE_EMAIL_VERIFICATION: "false"` désactive la vérification même avec un SMTP.
- Les comptes existants avant la mise à jour sont considérés comme vérifiés. L’administrateur peut valider une adresse à la main (*Utilisateurs → Valider l’e-mail*).

## Connexion avec Google et Facebook

Gratuite chez les deux fournisseurs. Elle exige une adresse **publique en HTTPS** (nom de domaine) : Google et Facebook refusent les adresses IP locales.

**Google** : console.cloud.google.com → *API et services → Identifiants → Créer un ID client OAuth* (type « Application Web »). URI de redirection autorisé : `https://ton-domaine/api/auth/oauth/google/callback`. Renseigne `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.

**Facebook** : developers.facebook.com → *Créer une application* → produit *Facebook Login* → URI de redirection OAuth valide : `https://ton-domaine/api/auth/oauth/facebook/callback`. Renseigne `FACEBOOK_CLIENT_ID` (identifiant de l’app) et `FACEBOOK_CLIENT_SECRET`.

Les boutons apparaissent automatiquement sur la page de connexion. Si l’adresse e-mail confirmée par Google/Facebook correspond à un compte existant, il est relié ; sinon un compte est créé (avec l’essai Premium). La double authentification reste demandée si elle est activée.

> **Apple** n’est pas proposé : « Se connecter avec Apple » exige un abonnement au programme développeur Apple (99 $/an).

## Langues

L’interface existe en **français, anglais, allemand et espagnol** (sélecteur 🌐 en bas du menu ; le choix est enregistré sur le compte). Les **cours et exercices** restent en français.

Les traductions se trouvent dans `tools/i18n/ui_*.py` (texte français → anglais, allemand, espagnol) et sont compilées dans `apps/web/src/locales/` :

```bash
python3 tools/i18n/wrap.py apps/web/src/pages/NouvellePage.tsx   # entoure les textes par t(…)
python3 tools/i18n/build.py                                      # régénère les fichiers et liste les textes à traduire
```

Un texte sans traduction s’affiche simplement en français.
