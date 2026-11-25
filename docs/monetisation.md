# Monétisation : Premium, boutique de clés, publicités

Codemori reste **utilisable gratuitement** : tous les cours, exercices, examens et projets sont accessibles sans payer. Le Premium retire les limites et ajoute du confort. Tout se règle dans *Administration → Monétisation*.

## 1. L'offre gratuite et le Premium

| | Gratuit | Premium |
|---|---|---|
| Énergie | 5, +1 toutes les 30 min. Une mauvaise réponse (QCM, code à trous, prédiction…) ou un examen raté coûte 1. **Les exercices d'écriture de code, les cours et l'IDE ne coûtent jamais d'énergie.** Une révision réussie rend 1 énergie | Illimitée |
| Exécutions libres (bouton *Exécuter*, IDE) | 40 par jour | Illimitées |
| Publicités | Courtes pubs **facultatives** (+1 énergie, +10 exécutions), 6 par jour au maximum | Aucune |
| Assistante IA | Indices et explications d'erreurs sans IA | Conversation IA complète |
| Protection de série | — | 1 jour manqué pardonné par semaine |
| Avatar | Toutes les bases | Couronne, auréole, cape, armure, cheveux arc-en-ciel, fonds galaxie… |
| Profil | — | Badge Premium doré, cadre animé, nom en couleur |

Le badge **« Ancien Premium »** reste affiché à vie pour les anciens membres, et le profil indique le nombre total de jours de Premium.

**Équilibre recherché** : l'apprenant gratuit n'est jamais bloqué longtemps. Il peut attendre la recharge (30 min), faire une révision ou regarder une pub de 15 s. Il voit régulièrement ce qu'apporte Premium : encart discret, couronne de Kiri, avatars exclusifs, profils des membres Premium. Chaque nouvel inscrit reçoit **7 jours d'essai Premium** pour y goûter.

Tous ces nombres sont réglables (*Monétisation → Réglages de l'offre gratuite*). Décoche *Système Premium activé* pour un usage familial sans limite.

## 2. Encaisser les paiements avec Stripe

Stripe gère la page de paiement : carte bancaire, **Apple Pay, Google Pay et Link** (paiement en un clic, comme Shop Pay). L'argent est versé automatiquement sur ton compte bancaire (IBAN). Tu n'as aucune donnée bancaire à stocker.

### a) Créer le compte

1. Crée un compte sur **stripe.com**, active-le (identité, IBAN, statut : particulier, micro-entreprise…).
2. *Paramètres → Moyens de paiement* : active Apple Pay, Google Pay et Link.
3. *Développeurs → Clés API* : copie la **clé secrète** (`sk_live_…`, ou `sk_test_…` pour tester).

### b) Boutique de clés (1 mois 4,99 €, 2 mois 9,98 €, 3 mois 12,50 €)

Il suffit d'ajouter **une variable** à l'app :

```yaml
STRIPE_SECRET_KEY: sk_live_xxxxxxxxxxxxxxxx
```

Fonctionnement : l'apprenant clique sur *Acheter* et paie sur la page Stripe. Au retour sur Codemori, sa clé `KIRI-XXXX-XXXX-XXXX` s'affiche immédiatement. Il peut l'activer ou l'**offrir**.

Cela fonctionne **même si le NAS n'est accessible qu'en réseau local** : c'est Codemori qui interroge Stripe au retour du paiement.

Les prix se modifient dans *Monétisation → Offres de la boutique* (en centimes).

### c) Webhook (recommandé) et abonnement mensuel (facultatif)

Le webhook prévient Codemori des paiements même si l'acheteur ferme la page. Il est **indispensable pour l'abonnement mensuel**, qui se renouvelle tout seul. Il nécessite que Codemori soit joignable depuis Internet en HTTPS (voir [truenas.md](truenas.md), section 5).

1. Stripe → *Développeurs → Webhooks → Ajouter un endpoint* : `https://ton-domaine/api/billing/webhook`.
2. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.
3. Copie le **secret de signature** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. Abonnement mensuel : Stripe → *Catalogue de produits → Ajouter un produit* « Codemori Premium », prix récurrent 4,99 €/mois → copie l'identifiant `price_…` → `STRIPE_PRICE_ID`. Le bouton *S'abonner chaque mois* apparaît alors, ainsi que *Gérer mon abonnement* (résiliation, factures) via le portail client Stripe. Active ce portail dans *Paramètres → Portail client*.

**Tester sans argent réel** : utilise les clés `sk_test_…` et la carte `4242 4242 4242 4242` (date future, n'importe quel CVC).

> **Côté légal (France)** : vendre en ligne demande un statut (la micro-entreprise suffit pour démarrer) et des mentions légales et CGV sur le site. Stripe te donne un récapitulatif des ventes pour ta déclaration. Renseigne-toi auprès de l'URSSAF ou d'un comptable pour la TVA.

## 3. Vendre des clés sur Discord

Les clés sont des codes génériques : tu peux les vendre où tu veux.

1. *Monétisation → Clés Premium* : génère par exemple 50 clés de **30 jours** avec la note `discord-1-mois`, puis 50 de 90 jours avec la note `discord-3-mois`.
2. Clique sur **Exporter (.txt)** : une clé par ligne.
3. Sur une boutique compatible Discord (**Sell.app**, **Sellix**, **Ko-fi**…), crée un produit de type « clés / serials », colle le fichier comme stock et fixe le prix (4,99 € / 12,50 €).
4. Relie la boutique à ton serveur Discord avec son bot. À chaque achat, l'acheteur reçoit automatiquement une clé en message privé.
5. L'acheteur l'active dans **Premium → Activer une clé**.

Tu vois dans le tableau qui a utilisé chaque clé. Une clé ne sert qu'une fois (réglable : *Utilisations / clé*, par exemple pour un code promo partagé).

Tu peux aussi offrir du Premium directement : *Utilisateurs → 👑 Premium*.

## 4. Être rémunéré par la publicité (Google AdSense)

Par défaut, les « publicités » sont des **annonces maison** : messages de Kiri, ou tes propres annonces (*Monétisation → Annonces maison* : ton Discord, un partenaire, un sponsor…). Elles ne rapportent rien en elles-mêmes, sauf si tu vends ces emplacements à un sponsor.

Pour être **payé par Google** :

1. Il faut un **site public avec un nom de domaine** (par exemple `codemori.fr`) accessible en HTTPS, avec du contenu. AdSense refuse les adresses IP et les sites en réseau local.
2. Inscris-toi sur **adsense.google.com**, ajoute ton domaine et attends la validation (de quelques jours à quelques semaines). Le fichier `https://ton-domaine/ads.txt` exigé par Google est servi automatiquement par Codemori dès que `ADSENSE_CLIENT` est renseigné.
3. Crée deux blocs d'annonces « display » : un **carré** (affiché pendant la pub récompensée) et un **horizontal** (bannière discrète en bas de page pour les comptes gratuits).
4. Renseigne dans l'app :

```yaml
ADS_PROVIDER: adsense
ADSENSE_CLIENT: ca-pub-1234567890123456
ADSENSE_SLOT_REWARD: "1111111111"
ADSENSE_SLOT_BANNER: "2222222222"
```

La politique de sécurité (CSP) s'ouvre alors automatiquement aux domaines de Google. Les membres Premium ne voient **aucune** publicité. Pour l'Europe, AdSense t'impose d'afficher un bandeau de consentement (RGPD) : active le message de consentement proposé par Google dans ton compte AdSense (*Confidentialité et messages*).

## 5. Anti-bloqueur de publicité

Pour les comptes gratuits, Codemori détecte les bloqueurs (uBlock, AdBlock, Brave…). Une fois par jour au maximum, Kiri le fait remarquer : d'abord **triste**, puis **fâchée** si l'apprenant insiste 😤. Elle propose de désactiver le bloqueur pour ce site, ou de passer à Premium. L'apprenant peut toujours *continuer quand même* : on ne le bloque pas, mais les pubs récompensées (énergie, exécutions) ne fonctionnent pas tant que le bloqueur est actif.

## 6. Sécurité des comptes

- **Double authentification** (*Profil → Double authentification*) : application TOTP (Google Authenticator, Aegis, 2FAS, Bitwarden…) et 10 codes de secours à usage unique. Le secret est chiffré en base (AES-256-GCM) avec `APP_SECRET`, ou à défaut avec `RUNNER_TOKEN`. **Ne change plus cette valeur** une fois des utilisateurs inscrits à la 2FA.
- Téléphone perdu et plus de codes de secours : *Administration → Utilisateurs → Reset 2FA*.
- **Niveaux verrouillés** : un apprenant ne peut plus régler son niveau lui-même (anti-triche). Le niveau vient de l'évaluation de départ (refaisable une fois par semaine) et des examens réussis. L'administrateur peut le modifier : *Utilisateurs → Niveau*.

## 7. Meilleur codeur de la semaine

Celui ou celle qui gagne le plus d'XP du lundi au dimanche remporte le titre (+150 XP, réglable). Le titre apparaît sur son profil et dans le temple de la renommée. Seuls les comptes qui acceptent d'apparaître dans le classement participent : c'est le réglage par défaut, désactivable dans le profil. Les administrateurs sont exclus.
