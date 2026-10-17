import type { Fournisseur, Produit } from './types'

/* ============================================================
   LE REAPPROVISIONNEMENT

   Une liste de commande sert a etre envoyee a un grossiste. Elle
   n'est donc pas seulement un tri : elle est GROUPÉE PAR
   FOURNISSEUR, parce qu'on commande a quelqu'un, pas « un peu de
   tout ».

   La quantite commandee est le stock qu'on veut retrouver moins ce
   qu'il reste. Avec un seul seuil, c'est simple :
   commander = seuil - stock restant.
   ============================================================ */

export type LigneReappro = {
  produitId: string
  nom: string
  codeBarres?: string
  unite: string
  stock: number
  seuil: number
  aCommander: number
  fournisseurId?: string
  rupture: boolean
  peremptionLaPlusProche?: string
}

export type CommandeFournisseur = {
  fournisseurId?: string
  fournisseur: string
  lignes: LigneReappro[]
  total: number
}

export function ligneReappro(
  produit: Produit,
  stock: number,
  peremptionLaPlusProche?: string,
): LigneReappro {
  const aCommander = Math.max(0, produit.seuil - stock)
  return {
    produitId: produit.id,
    nom: produit.nomFr,
    codeBarres: produit.codeBarres,
    unite: produit.unite,
    stock,
    seuil: produit.seuil,
    aCommander,
    fournisseurId: produit.fournisseurId,
    rupture: stock <= 0,
    peremptionLaPlusProche,
  }
}

/** Les produits a recommander : sous le seuil, ruptures d'abord. */
export function produitsARecommander(
  produits: readonly Produit[],
  stocks: ReadonlyMap<string, number>,
  peremptionParProduit: ReadonlyMap<string, string> = new Map(),
): LigneReappro[] {
  return produits
    .filter((p) => p.actif)
    .map((p) => ligneReappro(p, stocks.get(p.id) ?? 0, peremptionParProduit.get(p.id)))
    .filter((l) => l.aCommander > 0)
    .sort((a, b) => {
      if (a.rupture !== b.rupture) return a.rupture ? -1 : 1
      if (a.aCommander !== b.aCommander) return b.aCommander - a.aCommander
      return a.nom.localeCompare(b.nom)
    })
}

export function grouperParFournisseur(
  lignes: readonly LigneReappro[],
  fournisseurs: readonly Fournisseur[],
): CommandeFournisseur[] {
  const parId = new Map(fournisseurs.map((f) => [f.id, f.nom]))

  const groupes = new Map<string, LigneReappro[]>()
  for (const l of lignes) {
    const cle = l.fournisseurId ?? 'sans-fournisseur'
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle)!.push(l)
  }

  const commandes: CommandeFournisseur[] = [...groupes.entries()].map(([cle, ls]) => ({
    fournisseurId: cle === 'sans-fournisseur' ? undefined : cle,
    fournisseur: parId.get(cle) ?? 'Fournisseur non précisé',
    lignes: ls,
    total: ls.reduce((s, l) => s + l.aCommander, 0),
  }))

  /* Les commandes sans fournisseur known goes last : on ne les
     oublie pas, on ne les melange pas a une commande a envoyer. */
  return commandes.sort((a, b) => {
    if (!a.fournisseurId) return 1
    if (!b.fournisseurId) return -1
    return a.fournisseur.localeCompare(b.fournisseur)
  })
}

/** Le texte a copier-coller dans un message ou un mail. */
export function commanderEnTexte(commande: CommandeFournisseur): string {
  const lignes = commande.lignes.map((l) => {
    const details = [`${l.aCommander} ${l.unite}`, `stock ${l.stock}`, `seuil ${l.seuil}`]
    if (l.codeBarres) details.push(l.codeBarres)
    return `  · ${l.nom} — ${details.join(', ')}`
  })
  return `${commande.fournisseur}\n${lignes.join('\n')}\n\nTotal : ${commande.total} unites`
}