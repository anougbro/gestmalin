/* ============================================================
   LE STOCK — toujours calcule, jamais stocke

   Il n'existe aucun champ "stock actuel" dans l'application.
   Ce fichier est le SEUL endroit ou l'on parle de quantite,
   et il ne fait que lire des mouvements.

   Regle unique, quatre cas, aucune exception :
   ============================================================ */

import type { IdProduit, Mouvement, TypeMouvement } from './types'

/* Combien un mouvement de chaque type ajoute au stock.
   1 = ca rentre, 0 = ca bouge sans changer le total, -1 = ca sort. */
export const EFFETS: Record<TypeMouvement, 1 | 0 | -1> = {
  reception: 1,
  sortie: -1,
  perte: -1,
  transfert: 0,
}

/* ---------- La quantite en stock d'un produit ----------
   C'est la SEULE fonction qui produit une quantite.
   Tout le reste de l'application passe par ici. */
export function quantiteProduit(
  produitId: IdProduit,
  mouvements: readonly Mouvement[],
): number {
  let total = 0
  for (const m of mouvements) {
    if (m.produitId !== produitId) continue
    total += m.quantite * EFFETS[m.type]
  }
  return total
}