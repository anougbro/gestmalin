# Gestmalin

Gestion de stock pour une pharmacie de quartier : médicaments et produits ménagers,
**hors ligne**, sur **un seul téléphone partagé**. Chacun entre avec son login et son mot
de passe, et ne voit que son rayon.

**Application :** <https://anougbro.github.io/gestmalin/> — à ouvrir dans Chrome ou Edge
(pas Internet Explorer), puis « Ajouter à l'écran d'accueil » pour l'installer.

Ce que l'application ne fait pas, volontairement : aucune donnée patient, aucun prix,
aucune caisse, aucun compte en ligne. Le stock est la seule chose qu'elle connaisse.

| | |
|---|---|
| Le code | [`gestmalin/`](gestmalin/) |
| Installation, architecture, commandes | [`gestmalin/README.md`](gestmalin/README.md) |
| Décisions de sécurité des comptes | [`gestmalin/DECISIONS.md`](gestmalin/DECISIONS.md) |

---

## En trois gestes

1. **Réception** — on scanne la boîte, on saisit la quantité et la date de péremption.
2. **Rangement** — l'application dit où poser, et dans quel ordre sortir (FEFO : le plus
   proche de la péremption d'abord).
3. **Sortie** — on scanne, on saisit la quantité ; le stock se déduit du journal, il ne
   se corrige jamais à la main.

Le stock n'est jamais un chiffre stocké : il est **recalculé** à partir des mouvements,
qui ne s'effacent pas. C'est ce qui rend un écart visible au lieu de le maquiller.

## Le téléphone

- Une seule installation, plusieurs personnes, un code à cinq chiffres chacune.
- La première personne qui crée son compte devient **directrice** ; les suivantes sont
  préparatrices. La directrice peut débloquer un compte, remettre un mot de passe
  provisoire et transférer un rayon.
- Cinq mauvais mots de passe bloquent le compte quinze minutes. La directrice peut lever
  le blocage tout de suite, depuis Réglages.
- Le jeu d'essai (Réglages → « Charger le jeu d'essai ») remplit l'application avec des
  produits et trois comptes de démonstration. Il ne s'exécute que sur un geste explicite.

## Sauvegarde

L'export `.xlsx` / `.csv` (Fichiers → Import · Export) est la **seule** sauvegarde : la
base vit dans le navigateur du téléphone et disparaît avec lui. Un export par semaine,
rangé hors du téléphone.
