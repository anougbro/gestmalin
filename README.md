# Gestmalin

Gestion de stock pour une pharmacie de quartier : médicaments et produits ménagers,
**hors ligne**, sur **un seul téléphone partagé**. Chacun entre avec son numéro et son mot
de passe, et ne voit que son rayon.

**Application :** <https://anougbro.github.io/gestmalin/> — à ouvrir dans Chrome ou Edge
(pas Internet Explorer), puis « Ajouter à l'écran d'accueil » pour l'installer. Le bouton
est aussi dans Réglages → Installer.

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

- Une seule installation, plusieurs personnes, un code à cinq chiffres chacune. Le numéro
  de téléphone et le courriel sont **uniques** : deux comptes ne peuvent pas les partager.
- La première personne qui crée son compte devient **directrice** et entre tout de suite.
  Les suivantes sont créées **en attente** : elles ne peuvent pas entrer avant que la
  directrice les ait autorisées depuis Réglages.
- La directrice peut **autoriser**, **bloquer**, remettre le code provisoire `00000`,
  **supprimer un compte**, ou effacer tous les comptes d'un coup. Elle ne peut ni bloquer
  ni supprimer son propre compte, et il doit toujours rester un directeur actif.
- Cinq mauvais mots de passe bloquent le compte quinze minutes. La directrice peut lever
  le blocage tout de suite, depuis Réglages.
- **Aucune donnée de démonstration.** Les produits viennent de la saisie, du scan ou d'un
  import. Effacer le stock ne touche pas aux comptes ; effacer les comptes ne touche pas
  au stock.

## Sauvegarde

L'export `.xlsx` / `.csv` (Fichiers → Exporter) est la **seule** sauvegarde : la
base vit dans le navigateur du téléphone et disparaît avec lui. Un export par semaine,
rangé hors du téléphone.
