/* ============================================================
   LES IDENTIFIANTS DU JEU D'ESSAI

   Le jeu d'essai a ete retire de l'application : une pharmacie ne
   doit pas contenir de faux medicaments. Mais les telephones qui
   l'ont deja charge gardent ces lignes dans leur base. La migration
   5 les efface une fois, et ces listes sont la seule chose qui
   reste de l'essai.

   On supprime par IDENTIFIANT EXACT, jamais par nom ni par
   categorie : un vrai produit peut s'appeler « Paracetamol », et
   l'effacer parce que son nom ressemble a celui d'un faux serait
   une perte de stock reelle.
   ============================================================ */

export const COMPTES_ESSAI = ['u-1', 'u-2', 'u-3'] as const

export const DEMANDES_ESSAI = ['dem-1'] as const

/* Les produits du jeu d'essai. `sero` etait present deux fois
   dans l'ancien fichier (serum et seringue) : un seul identifiant,
   donc une seule ligne a effacer. */
export const PRODUITS_ESSAI = [
  'para1', 'para2', 'amox1', 'ibup1', 'doli1', 'vitc', 'sero',
  'siro', 'vitd', 'pans', 'or',
  'the', 'savon', 'lessive', 'seau', 'serviette', 'eau', 'sucre',
  'quai1', 'quai2', 'quai3',
] as const
