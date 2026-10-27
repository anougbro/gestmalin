# Décisions — comptes et sécurité

Ce document explique **pourquoi** l'application s'écarte, sur cinq points, du standard
d'authentification habituel (Argon2id, jeton d'accès + jeton de rafraîchissement, code à
six chiffres ou plus, réinitialisation par courriel). Il ne décrit pas seulement ce qui est
fait : il dit ce que l'on accepte de ne pas protéger, et à quelle condition.

Deux règles propres à ce téléphone s'y ajoutent : le **numéro** et le **courriel** d'un
compte sont uniques. Deux personnes ne partagent ni l'un ni l'autre.

À lire avant de « corriger » la connexion : chaque écart est un choix, pas un oubli.

---

## 1. Le contexte commande tout

| Contrainte | Conséquence |
|---|---|
| **Aucun serveur.** L'application est un dossier statique sur GitHub Pages. | Il n'y a personne pour émettre un jeton, hacher un mot de passe, envoyer un courriel ou révoquer un accès. |
| **Tout est hors ligne**, y compris la première ouverture. | La vérification du mot de passe se fait sur le téléphone, avec les données du téléphone. |
| **Un seul téléphone partagé**, dans la pharmacie. | Celui qui tient l'appareil peut lire la base. La protection n'est pas contre lui. |
| **Personnel peu à l'aise avec l'écrit.** | Un code court et un pavé de chiffres, jamais un mot de passe à recopier. |
| **Aucune donnée patient, aucun prix, aucune caisse.** | Ce qui fuit, au pire, c'est un état de stock — pas une donnée de santé ni un chiffre d'affaires. |

La question n'est donc pas « comment résister à un attaquant distant ? » (il n'y a pas de
porte distante) mais « comment empêcher qu'une personne entre sous le nom d'une autre, par
erreur ou par commodité ? ». C'est un problème de **traçabilité**, pas de cryptographie.

---

## 2. L'empreinte n'est pas Argon2id

`src/domaine/acces.ts` calcule une empreinte déterministe (deux hachages entrelacés,
FNV-1a et un mélange de type Murmur, salés avec l'identifiant de la personne et la chaîne
`gestmalin`). Ce n'est **pas** une fonction de dérivation de clé : elle est rapide, sans
facteur de travail, sans sel aléatoire par compte.

**Pourquoi pas Argon2id :**

1. **Il n'y a pas de serveur pour le faire.** Le standard suppose un hachage côté serveur,
   avec un sel et un poivre que le client ne voit jamais. Ici, le vérificateur et
   l'attaquant sont la même personne, sur le même appareil : elle peut remplacer la base,
   l'empreinte et le code de vérification. Aucun algorithme ne protège de cela.
2. **Un code à cinq chiffres ne se défend pas par le coût de calcul.** Cent mille
   combinaisons. Même à 100 ms par essai, la totalité se parcourt en moins de trois heures
   sur un ordinateur ; et un facteur de travail élevé ne ferait que ralentir la personne
   qui tape son code avec des gants, sur un téléphone d'entrée de gamme.
3. **La vraie défense est ailleurs** : cinq essais, puis quinze minutes de blocage
   (§5), et un appareil qui reste dans la pharmacie.

**Ce que l'empreinte protège quand même :** elle empêche de lire les codes en clair dans
IndexedDB, donc de les apprendre par-dessus l'épaule de quelqu'un qui ouvre les outils de
développement. C'est exactement ce qu'on lui demande.

**Ce qu'elle ne protège pas :** une attaque hors ligne sur une copie de la base. Elle
n'est pas conçue pour cela, et le document le dit plutôt que de le laisser croire.

---

## 3. Pas de jeton : la session vit dans l'onglet

Il n'y a ni JWT, ni jeton de rafraîchissement, ni rotation, ni nonce anti-rejeu. La raison
est simple : **il n'y a aucun appel réseau à authentifier**. Un jeton protégerait une API
qui n'existe pas.

À la place, `sessionStorage` ne garde que l'identifiant de la personne
(`gestmalin.session`), et la session est **relue en base à chaque démarrage** : le rôle, le
rayon et l'état du compte viennent d'IndexedDB, pas d'une copie figée dans le navigateur.

- `sessionStorage` et non `localStorage` : la session meurt avec l'onglet. Un téléphone
  posé sur le comptoir ne reste pas ouvert sous le nom du précédent toute la journée.
- Aucun code n'est conservé, ni en clair ni haché, dans le stockage de session.
  (`scripts/verifier-pave-session.ts` le vérifie.)
- Se déconnecter efface la clé ; un rechargement ne déconnecte pas, parce que sur un
  téléphone mal habillé, perdre sa session toutes les cinq minutes ferait abandonner
  l'outil.

---

## 4. Cinq chiffres, pas six

`LONGUEUR_CODE = 5`, `LONGUEUR_TELEPHONE = 10`. Le code est court parce qu'il est tapé
plusieurs fois par jour, avec des gants, par des personnes qui ne retiennent pas un mot de
passe. Cent mille combinaisons suffisent pour que le voisin de rayon ne tombe pas dessus
au hasard, ce qui est le seul adversaire réaliste.

Le vrai verrou n'est pas la longueur : c'est le **compteur d'essais**. Un code long sans
limite d'essais est plus faible qu'un code court avec cinq essais.

---

## 5. Blocage : cinq essais, quinze minutes, levée sur place

`ESSAIS_MAX = 5`, `DUREE_BLOCAGE_MS = 15 min`.

- Le compteur est **dans IndexedDB** (`tentatives`, `bloqueJusqua`), pas dans l'écran. Un
  compteur en mémoire se remettrait à zéro au premier rafraîchissement : il ne bloquerait
  rien.
- Le blocage est vérifié **avant** la comparaison du code : pendant le blocage, même le
  bon mot de passe est refusé. Comparer d'abord offrirait des essais gratuits, c'est-à-dire
  exactement ce qu'un blocage doit retirer.
- Une entrée réussie remet le compteur à zéro.
- **Le directeur peut aussi fermer un compte pour de bon** (`bloquer`) : ce n'est pas le
  blocage temporaire des cinq essais, c'est une décision, sans durée. Il se lève par
  « Autoriser ». Personne ne peut fermer son propre compte, et il doit rester un directeur
  actif : sans cela, plus personne ne pourrait rouvrir.
- **Le blocage tombe tout seul au bout de quinze minutes.** Un blocage définitif sans
  serveur n'aurait qu'une issue : effacer la base — donc perdre le stock pour cinq chiffres
  mal tapés. Et un directeur qui se bloque lui-même n'aurait plus aucun recours.
- **Un directeur peut lever le blocage immédiatement**, depuis Réglages, personne par
  personne. C'est le seul recours quand on ne veut pas attendre, et c'est un geste
  volontaire, tracé par l'écran.
- La vérification du rôle est **dans `debloquer()`**, pas seulement dans l'affichage :
  cacher un bouton n'est pas une interdiction. Un appel direct à la fonction avec un
  compte non autorisé est refusé, et ne touche ni au compteur ni au mot de passe.

**Compromis assumé :** quelqu'un qui tient le téléphone peut attendre quinze minutes et
recommencer. C'est acceptable, parce que l'appareil est dans la pharmacie et que la
personne qui l'a en main n'est pas l'ennemi désigné. L'alternative — un verrouillage
définitif — coûterait le stock.

---

## 6. Aucun compte semé : le premier arrivé est directeur, les autres attendent

Il n'y a **aucun compte préparé au démarrage**. Le premier compte créé sur le téléphone
devient `directeur` et **entre immédiatement** : sans lui, personne ne pourrait autoriser
les suivants. Les comptes suivants sont créés `actif: false, enAttente: true` : ils ne
peuvent pas entrer avant que le directeur les ait **autorisés** depuis Réglages. La
connexion distingue « Compte en attente » de « Compte bloqué ».

**Pourquoi l'accord du directeur :** le téléphone est partagé. Sans cet accord, n'importe
qui pourrait créer un compte et lire le stock. L'accord est un geste local, sans serveur :
il ne demande aucune connexion au directeur au moment de l'inscription.

**Pourquoi aucun compte semé :** un compte semé, c'est un mot de passe connu de tous —
écrit dans le code, donc lisible sur GitHub. Ce serait le point faible de toute
l'application, et il vieillirait mal : personne ne change un code qui marche.

`00000` existe encore, mais uniquement comme **mot de passe provisoire**, remis
volontairement par un directeur à une personne qui a perdu le sien. Il n'ouvre rien par
défaut, et la personne est invitée à le changer dès son entrée. Il ne rouvre pas un compte
bloqué : le blocage tient jusqu'à « Autoriser ».

**Aucune donnée de démonstration.** Le jeu d'essai a été retiré : une pharmacie ne doit pas
contenir de faux médicaments. Une migration unique efface les faux comptes, produits, lots,
mouvements et demandes des téléphones qui l'avaient chargé, **par identifiant exact** —
jamais par nom, car un vrai produit peut s'appeler « Paracétamol ». Si le seul directeur
était un faux compte, le premier compte réel reprend la direction.

**Supprimer un compte** n'efface pas ses mouvements : le journal reste vrai, et l'auteur
n'est pas affiché. Deux gestes séparés vident les comptes ou le stock, jamais les deux à la
fois : effacer le stock ne doit pas fermer la porte au directeur.

---

## 7. Le courriel est un contact, pas un moyen de connexion

Le courriel est demandé à la création du compte, **facultatif**, et affiché dans la liste
des personnes. Il sert à savoir qui appeler quand quelqu'un dit « j'ai oublié mon mot de
passe ». **Aucun courriel ne part** : il n'y a pas de serveur pour en envoyer.

Quatre règles qui en découlent :

1. Le courriel **n'ouvre aucune porte**. On n'entre pas par son courriel, et il n'existe
   pas de lien de réinitialisation. Un lien serait soit inopérant hors ligne, soit un
   contournement du code à cinq chiffres.
2. **Aucune donnée n'est envoyée** : le courriel ne quitte pas le téléphone. C'est une
   chaîne de caractères dans IndexedDB, au même titre que le nom.
3. Il est **unique** quand il est présent. `mailLibre()` compare les adresses sans tenir
   compte de la casse ni des espaces autour : `Amina@Exemple.com` et
   `amina@exemple.com` désignent la même boîte. Deux comptes sur la même adresse, et le
   responsable ne sait plus qui joindre quand l'un des deux oublie son mot de passe.
   L'unicité est vérifiée **à l'écriture** (`changerMail`, création de compte), pas
   seulement à la saisie : entre la frappe et la validation, une autre personne peut avoir
   pris l'adresse.
4. Il est **effaçable** : vider le champ supprime la clé, au lieu d'écrire une chaîne vide
   qui s'afficherait comme une adresse dans la liste. Un compte sans courriel ne réserve
   aucune adresse.

Le numéro suit la même règle d'unicité, et pour une raison plus grave : le code de l'une
ouvrirait le compte de l'autre. `numeroLibre()` la vérifie à la création comme au
changement de numéro.

---

## 8. Ce que ces choix ne protègent pas

À dire clairement, pour que personne ne s'appuie sur une garantie qui n'existe pas :

| Risque | Réalité |
|---|---|
| Quelqu'un prend le téléphone déverrouillé | Il peut agir sous le nom affiché. Le code n'y change rien. La parade est l'écran de verrouillage du téléphone, pas l'application. |
| Lecture de la base avec les outils du navigateur | Possible. Les codes sont en empreinte, le reste (stock, noms, rayons) est en clair. C'est assumé : aucune donnée patient, aucun prix. |
| Copie modifiée de l'application | Possible : le code est public. Une personne qui modifie l'application peut entrer sous n'importe quel nom. La parade est que l'application installée vienne du lien officiel. |
| Fichier d'export `.xlsx` | Non chiffré, lisible par quiconque l'ouvre. C'est voulu : c'est la sauvegarde, elle doit rester lisible sans l'application. |
| Perte ou vol du téléphone | La base locale disparaît avec lui. L'export hebdomadaire est la seule sauvegarde — c'est pour cela qu'il est mis en avant. |

Ce qui est réellement protégé : **la confusion entre deux personnes**. Deux comptes ne
peuvent pas partager un numéro (la connexion refuse les deux, même avec le bon code), et
chaque mouvement porte son auteur.

---

## 9. Ce qui vérifie ces décisions

- `src/donnees/blocage.test.ts` — 15 tests : décompte, blocage au cinquième essai, refus du
  bon code pendant le blocage, expiration, remise à zéro, refus d'un non-directeur, remise
  de `00000`, validation du courriel, unicité insensible à la casse, refus d'un courriel
  déjà pris, effacement du courriel.
- `src/donnees/comptes.test.ts` — autoriser, bloquer, supprimer : refus de son propre
  compte, refus de laisser le téléphone sans directeur actif, mouvements conservés,
  effacement de tous les comptes sans toucher au stock.
- `src/donnees/nettoyage.test.ts` — les données d'essai partent par identifiant exact, un
  vrai produit qui porte le même nom reste, et la direction revient au premier compte réel.
- `scripts/verifier-blocage.ts` — le parcours complet dans un vrai navigateur : cinq
  échecs, blocage, déblocage par la directrice, entrée avec l'ancien code, remise de
  `00000`, refus de l'ancien code.
- `scripts/verifier-comptes.ts` — aucun compte au démarrage, premier compte directeur,
  second compte **en attente**, refus de connexion tant qu'il n'est pas autorisé,
  autorisation par la directrice, puis changement de numéro — unicité comprise.
- `scripts/verifier-codes.ts` — la liste des comptes ne montre aucun code ; « Code 00000 »
  écrit bien l'empreinte en base, ouvre la porte, et l'ancien code ne passe plus.
- `scripts/verifier-courriels.ts` — un second compte ne peut prendre ni le courriel ni le
  numéro d'un autre, à la création comme dans les réglages ; la casse ne contourne pas le
  contrôle.
- `scripts/verifier-pave-session.ts` — la session ne contient que l'identifiant, et aucun
  code.

---

## 10. Si un jour il y a un serveur

Les trois premiers écarts tomberaient d'eux-mêmes, dans cet ordre :

1. **Argon2id côté serveur**, avec sel par compte et poivre hors base : la vérification
   quitte le téléphone, l'empreinte locale ne sert plus qu'à autoriser l'entrée hors ligne
   (session locale), pas à prouver l'identité.
2. **Jeton court + rafraîchissement avec rotation**, parce qu'il y aura enfin des appels à
   protéger.
3. **Réinitialisation par courriel** : le courriel devient un vrai canal, et non plus une
   simple fiche de contact. Il faudra alors le vérifier, et ne jamais l'utiliser comme
   facteur unique.

Le blocage et le compteur d'essais, eux, resteraient : ce sont les seules protections qui
comptent face à un code à cinq chiffres.
