# Gestmalin — l'application

Application web installable (PWA), **100 % hors ligne**, pour le stock d'une pharmacie :
médicaments et produits ménagers dans deux rayons séparés. Un téléphone partagé, un numéro
et un mot de passe à cinq chiffres par personne.

Elle s'installe depuis un lien, sans passer par un magasin d'applications :

1. ouvrir <https://anougbro.github.io/gestmalin/> dans Chrome ou Edge ;
2. menu du navigateur → **Ajouter à l'écran d'accueil**, ou Réglages → **Installer** ;
3. l'ouvrir depuis l'icône : elle démarre sans réseau, y compris la première fois.

Le numéro de téléphone et le courriel sont **uniques** : deux comptes ne peuvent pas les
partager. Le courriel reste facultatif, et aucun courriel ne part de l'application.

Internet Explorer ne peut pas l'exécuter. Ce n'est pas un défaut : l'application a besoin
d'IndexedDB, d'un service worker et des modules JavaScript modernes.

---

## Ce qu'elle tient

| Écran | Geste |
|---|---|
| Réception | scanner la boîte, saisir quantité et péremption — le produit arrive au quai |
| Ranger | poser au quai puis à sa place, dans l'ordre FEFO (le plus proche de la péremption sort en premier) |
| Sortie | sortir une quantité ; le stock se déduit du journal |
| Compter | comptage à l'aveugle, avec un second compte qui libère la ligne |
| Alertes | seuil bas, péremption proche, quai en attente |
| Commander / Réappro | ce qu'il faut racheter, et à qui |
| Étiquettes | étiquettes de rayon et de place, imprimables |
| Fichiers | import et export `.xlsx` / `.csv`, sans aucune dépendance |
| Réglages | numéro, courriel de contact, mot de passe, comptes (autoriser, bloquer, supprimer), installation |

Deux règles structurent le code :

- **Le stock n'est pas stocké.** Il est recalculé à partir des mouvements, qui sont
  ajoutés et jamais modifiés. Un écart se voit, il ne se maquille pas.
- **Aucun prix, aucune donnée patient, aucun serveur.** Ce qui n'est pas là ne peut pas
  fuir.

## Les comptes

Un téléphone neuf n'a **aucun compte préparé**. La première personne qui se présente crée
le sien par l'écran : elle devient directrice et entre immédiatement. Les comptes suivants
sont créés **en attente** — ils ne peuvent pas se connecter tant que la directrice ne les a
pas autorisés.

Dans Réglages, chaque compte affiche son état :

| État | Sens | Ce que la directrice peut faire |
|---|---|---|
| **Actif** | le compte peut entrer | bloquer, remettre `00000`, supprimer |
| **En attente** | jamais autorisé | autoriser, remettre `00000`, supprimer |
| **Bloqué** | fermé par la directrice, ou cinq essais ratés | autoriser, remettre `00000`, supprimer |

Trois garde-fous : on ne peut ni bloquer ni supprimer **son propre** compte, et il doit
toujours rester **un directeur actif**. Supprimer un compte ne touche pas à ses mouvements
de stock : le journal reste vrai.

Deux effacements distincts, jamais confondus :

- **Effacer les comptes** vide les personnes. Le stock, les rayons, les zones et les
  emplacements restent. La session se ferme, et le prochain compte créé redevient directeur.
- **Effacer le stock** vide produits, lots, mouvements, inventaires et alertes. Les comptes
  et les repères physiques restent.

## Architecture

```
src/
  domaine/     les règles pures, sans React ni base : acces, stock, FEFO, code-barres,
               reception, comptage, alertes, commande, xlsx, csv…
  donnees/     Dexie (IndexedDB) : les tables, et les fonctions qui écrivent
  etat/        la session, l'amorçage, la réparation des comptes
  interface/   18 écrans + les primitives (Bouton, Tuile, pavé de chiffres, icônes)
scripts/       les vérificateurs de navigateur (Playwright) et l'aide commune
DECISIONS.md   les écarts assumés au standard de sécurité, et pourquoi
```

Le sens des dépendances va de l'interface vers le domaine, jamais l'inverse : les règles
de stock se testent sans navigateur, et c'est ce que fait `src/**/*.test.ts`.

## Commandes

```bash
npm install
npm run dev        # http://localhost:5173
npm run verifier   # tsc + eslint + vitest (les trois doivent passer)
npm run build      # construit dist/
```

Pour construire comme GitHub Pages (sous-dossier `/gestmalin/`) :

```bash
# PowerShell
$env:BASE_PATH="/gestmalin/"; npx vite build
$env:BASE_PATH="/gestmalin/"; npx vite preview --port 4173
```

### Vérificateurs de navigateur

Ils pilotent un vrai Chrome sur le serveur de développement (`npm run dev` doit tourner) :

```bash
npm run verifier-comptes      # premier compte directeur, second compte en attente, autorisation
npm run verifier-codes        # remise du code 00000, sans jamais l'écrire à l'écran
npm run verifier-blocage      # cinq essais, blocage, déblocage, remise de 00000
npm run verifier-courriels    # numéro et courriel uniques, à l'écriture
npm run verifier-connexion    # la porte du numéro, pas à pas
npm run verifier-cloisonnement# un téléphone, deux personnes, deux rayons
npm run verifier-mobile       # trois largeurs de téléphone et le bureau
npm run verifier-hors-ligne   # le build servi sous /gestmalin/, réseau coupé
npm run verifier-site         # le site publié, réseau coupé
```

Les autres (`verifier-menu`, `verifier-scan`, `verifier-comptage`, `verifier-codes`,
`verifier-migration`, `verifier-demandes`, `verifier-texte`, `verifier-deconnexion`,
`verifier-atteignabilite`, `verifier-defilement`, `verifier-barre-haut`,
`verifier-pave`) couvrent chacun un écran ou une règle précise.

`verifier-hors-ligne` et `verifier-site` créent leur premier compte par l'écran : ils ne
peuvent pas semer de données par import, puisque `/src/...` n'existe plus dans un build.

## Ce qui a été décidé, et pourquoi

`DECISIONS.md` explique les cinq écarts volontaires au standard d'authentification :
pas d'Argon2id, pas de jeton, cinq chiffres, blocage de quinze minutes, courriel de contact
seulement. Il précise aussi l'unicité du numéro et du courriel. À lire avant de
« corriger » la connexion.
