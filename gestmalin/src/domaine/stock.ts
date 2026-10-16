/* ============================================================
   LE STOCK — toujours calcule, jamais stocke

   Il n'existe aucun champ "stock actuel" dans l'application.
   Ce fichier est le SEUL endroit ou l'on parle de quantite,
   et il ne fait que lire des mouvements.

   Regle unique, quatre cas, aucune exception :
   ============================================================ */

import type { IdEmplacement, IdLot, IdProduit, Lot, Mouvement, TypeMouvement } from './types'

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



/* ---------- La quantite d'un lot precis ----------
   Un lot est une boite reelle : meme produit, meme reference,
   date de peremption differente. */
export function quantiteLot(
  lotId: IdLot,
  mouvements: readonly Mouvement[],
): number {
  let total = 0
  for (const m of mouvements) {
    if (m.lotId !== lotId) continue
    total += m.quantite * EFFETS[m.type]
  }
  return total
}

/* ---------- Tous les lots d'un produit ---------- */
export function lotsDUnProduit(
  produitId: IdProduit,
  lots: readonly Lot[],
): Lot[] {
  return lots.filter((l) => l.produitId === produitId)
}

/* ---------- Ou se trouve chaque boite ----------
   Meme liste de mouvements, question differente, reponse   differente. C'est toute la puissance d'un modele derive. */
export function quantiteParEmplacement(
  produitId: IdProduit,
  mouvements: readonly Mouvement[],
): Map<IdEmplacement, number> {
  const parEmplacement = new Map<IdEmplacement, number>()

  const ajouter = (emplacement: IdEmplacement, delta: number) =>
    parEmplacement.set(emplacement, (parEmplacement.get(emplacement) ?? 0) + delta)

  for (const m of mouvements) {
    if (m.produitId !== produitId) continue
    if (m.depuisEmplacementId) ajouter(m.depuisEmplacementId, -m.quantite)
    if (m.versEmplacementId) ajouter(m.versEmplacementId, m.quantite)
  }

  return parEmplacement
}

/* ============================================================
   LA ROTATION — quel lot sort en premier ?

   FEFO (premier perime, premier sorti) : impose par l'OMS pour
   les produits medicaux. Un lot recu il y a 2 ans mais qui
   perime dans 6 semaines doit sortir AVANT un lot recu hier qui
   perime dans 3 ans.

   FIFO (premier recu, premier sorti) : le standard quand le
   produit n'a pas de date. Seaux, serviettes.
   ============================================================ */

/* ---------- La date de reception d'un lot ----------
   On ne la stocke pas. On la deduit du PREMIER mouvement
   de reception qui concerne ce lot. */
export function dateReceptionDuLot(
  lotId: IdLot,
  mouvements: readonly Mouvement[],
): string | undefined {
  let premiere: string | undefined
  for (const m of mouvements) {
    if (m.lotId !== lotId || m.type !== 'reception') continue
    if (premiere === undefined || m.date < premiere) premiere = m.date
  }
  return premiere
}

/* ---------- FEFO ou FIFO ? ----------
   La decision est prise pour le PRODUIT, pas pour le lot. */
export function rotationEstFEFO(
  produitId: IdProduit,
  lots: readonly Lot[],
): boolean {
  return lotsDUnProduit(produitId, lots).some((l) => l.peremption !== undefined)
}

/* ---------- L'ordre de sortie ---------- */
export function lotsParPriorite(
  produitId: IdProduit,
  lots: readonly Lot[],
  mouvements: readonly Mouvement[],
): Lot[] {
  const duProduit = lotsDUnProduit(produitId, lots)

  if (rotationEstFEFO(produitId, lots)) {
    return [...duProduit].sort((a, b) => {
      // Un lot sans date passe en dernier : il n'est pas le plus urgent.
      if (a.peremption === undefined) return 1
      if (b.peremption === undefined) return -1
      return a.peremption.localeCompare(b.peremption)
    })
  }

  return [...duProduit].sort((a, b) => {
    const dateA = dateReceptionDuLot(a.id, mouvements) ?? ''
    const dateB = dateReceptionDuLot(b.id, mouvements) ?? ''
    return dateA.localeCompare(dateB)
  })
}