import { base, ATTENTE_ID } from './base'
import type { LotRow, MouvementRow, ProduitRow, UtilisateurRow, DemandeApprobationRow } from './base'
import type { Emplacement, IdProduit, Lot, Mouvement, Zone } from '../domaine/types'
import {
  quantiteLot, quantiteProduit, lotsParPriorite,
} from '../domaine/stock'
import { exigerMouvementValide } from '../domaine/verification'

/* ============================================================
   LES DEPOTS — tout ce qui lit ou ecrit dans la base

   Point d'entree UNIQUE pour les ecritures.
   L'interface n'ecrit JAMAIS directement dans la base :
   elle passe par ici. C'est ce qui garantit que chaque
   mouvement est valide avant d'atteindre le disque.
   ============================================================ */

/* ---------- Petits outils ---------- */

export function nouvelId(): string {
  return crypto.randomUUID()
}

export function maintenant(): string {
  return new Date().toISOString()
}

/* ---------- 1. Le journal : le seul point d'ecriture ---------- */

/**
 * Enregistre UN mouvement.
 *
 * Chaque appel ecrit une seule ligne. C'est volontaire : si la
 * batterie lâche au milieu d'une reception de 40 boites,
 * on a perdu une ligne, pas quarante.
 */
export async function enregistrerMouvement(m: Mouvement): Promise<MouvementRow> {
  exigerMouvementValide(m)
  const ligne: MouvementRow = { ...m, synchro: 0 }
  await base.mouvements.add(ligne)
  return ligne
}

/* ---------- 2. Les referentiels ---------- */

export const produits = {
  tous: () => base.produits.toArray(),
  /* On filtre sur `actif` en memoire : un booleen ne peut pas
     etre un index IndexedDB. Voir le commentaire dans base.ts. */
  duRayon: (rayonId: string) =>
    base.produits.where('rayonId').equals(rayonId).filter((p) => p.actif).toArray(),
  actifs: () => base.produits.filter((p) => p.actif).toArray(),

  parCodeBarres: (code: string) =>
    base.produits.where('codeBarres').equals(code).first(),

  parId: (id: string) => base.produits.get(id),

  enregistrer: async (p: ProduitRow) => {
    const dejaLa = await base.produits.get(p.id)
    if (dejaLa) await base.produits.put(p)
    else await base.produits.add(p)
    return p
  },
}

/** Recherche par nom ou code-barres, dans un rayon. */
export async function rechercher(rayonId: string, texte: string): Promise<ProduitRow[]> {
  const q = texte.trim().toLowerCase()
  if (!q) return []

  const tous = await produits.duRayon(rayonId)
  const parBarre = await base.produits.where('codeBarres').startsWith(q).toArray()

  const vus = new Map<string, ProduitRow>()
  for (const p of [...tous, ...parBarre]) {
    if (!vus.has(p.id)) vus.set(p.id, p)
  }

  /* Un code-barre saisi en entier gagne TOUJOURS : c'est une
     identification exacte, pas une recherche. */
  return [...vus.values()].sort((a, b) => {
    const codeA = a.codeBarres ?? ''
    const codeB = b.codeBarres ?? ''
    if (codeA === q) return -1
    if (codeB === q) return 1

    const na = a.nomFr.toLowerCase(), nb = b.nomFr.toLowerCase()
    if (na === q) return -1
    if (nb === q) return 1

    /* Un nom qui commence par le texte saisi passe avant un
       simple mot dans le nom : "para" avant "sirop pour gorge". */
    const debuteA = na.startsWith(q), debuteB = nb.startsWith(q)
    if (debuteA && !debuteB) return -1
    if (!debuteA && debuteB) return 1

    return na.localeCompare(nb)
  }).slice(0, 30)
}

export const lots = {
  duProduit: (produitId: IdProduit) => base.lots.where('produitId').equals(produitId).toArray(),
  tous: () => base.lots.toArray(),
  parId: (id: string) => base.lots.get(id),

  enregistrer: async (l: LotRow) => {
    const dejaLa = await base.lots.get(l.id)
    if (dejaLa) await base.lots.put(l)
    else await base.lots.add(l)
    return l
  },
}

export const emplacements = {
  tous: () => base.emplacements.toArray(),
  deLaZone: (zoneId: string) =>
    base.emplacements.where('zoneId').equals(zoneId).sortBy('ordre'),
  parCode: (code: string) => base.emplacements.where('code').equals(code).first(),
  parId: (id: string) => base.emplacements.get(id),
}

export const zones = {
  toutes: () => base.zones.toArray(),
  duRayon: (rayonId: string) => base.zones.where('rayonId').equals(rayonId).toArray(),
  parId: (id: string) => base.zones.get(id),
  froides: () => base.zones.where('type').equals('reserve_froide').toArray(),
}

export const rayons = {
  tous: () => base.rayons.toArray(),
  parId: (id: string) => base.rayons.get(id),
}

export const categories = {
  duRayon: (rayonId: string) => base.categories.where('rayonId').equals(rayonId).toArray(),
  parId: (id: string) => base.categories.get(id),
}

export const fournisseurs = {
  duRayon: (rayonId: string) => base.fournisseurs.where('rayonId').equals(rayonId).toArray(),
  parId: (id: string) => base.fournisseurs.get(id),
}

/* ---------- 2. Le gesture de reception, en un seul appel ---------- */

/**
 * Enregistre une reception.
 *
 * Cette fonction fait DEUX choses dans UNE transaction : creer le
 * lot si besoin, puis ecrire le mouvement. Soit les deux
 * reussissent, soit rien n'est ecrit. On ne peut jamais se
 * retrouver avec un mouvement qui pointe vers un lot inexistant.
 *
 * La marchandise arrive au QUAI, pas directement en rayon : c'est
 * l'ecran Ranger qui la fera poser a sa place.
 */
export async function receptionner({
  rayonId, produitId, quantite, numero, peremption, originePays, numeroSerie,
  auteurId, versEmplacementId = ATTENTE_ID,
}: {
  rayonId: string
  produitId: string
  quantite: number
  numero?: string
  peremption?: string
  originePays?: string
  numeroSerie?: string
  auteurId: string
  versEmplacementId?: string
}): Promise<{ lot: LotRow; mouvement: MouvementRow }> {
  /* Un lot est unique par numero ET par date de peremption.
     Deux livraisons du meme lot ne creent pas deux lots. */
  const existant = numero
    ? await base.lots
        .where('produitId').equals(produitId)
        .filter((l) => l.numero === numero && l.peremption === peremption)
        .first()
    : undefined

  const lot = existant ?? {
    id: nouvelId(),
    produitId,
    numero,
    peremption,
    originePays,
    numeroSerie,
    quantite: 0,
    emplacementId: versEmplacementId,
  }

  const mouvement: Mouvement = {
    id: nouvelId(),
    type: 'reception',
    rayonId,
    produitId,
    lotId: lot.id,
    quantite,
    versEmplacementId,
    auteurId,
    date: maintenant(),
  }
  exigerMouvementValide(mouvement)

  const ligne: MouvementRow = { ...mouvement, synchro: 0 }

  await base.transaction('rw', base.lots, base.mouvements, async () => {
    if (!existant) await base.lots.add(lot)
    await base.mouvements.add(ligne)
  })

  return { lot, mouvement: ligne }
}

/** Pose une marchandise du quai a sa place : un simple transfert. */
export async function poserEnPlace({
  rayonId, produitId, lotId, quantite, versEmplacementId, auteurId,
}: {
  rayonId: string
  produitId: string
  lotId: string
  quantite: number
  versEmplacementId: string
  auteurId: string
}): Promise<MouvementRow> {
  return enregistrerMouvement({
    id: nouvelId(),
    type: 'transfert',
    rayonId,
    produitId,
    lotId,
    quantite,
    depuisEmplacementId: ATTENTE_ID,
    versEmplacementId,
    auteurId,
    date: maintenant(),
  })
}

/** Sors de la marchandise en suivant la rotation : FEFO si dates, FIFO sinon. */
export async function sortirQuantite({
  rayonId, produitId, lotId, quantite, motif, auteurId, depuisEmplacementId,
}: {
  rayonId: string
  produitId: string
  lotId: string
  quantite: number
  motif: string
  auteurId: string
  depuisEmplacementId: string
}): Promise<MouvementRow> {
  return enregistrerMouvement({
    id: nouvelId(),
    type: 'sortie',
    rayonId,
    produitId,
    lotId,
    quantite,
    depuisEmplacementId,
    motif,
    auteurId,
    date: maintenant(),
  })
}

/* ---------- 3. Les lectures de stock ---------- */

/**
 * La quantite en stock d'un produit.
 * On va chercher les mouvements par l'index produit plutot que
 * de tout balayer : la base a un index [produitId+date], donc
 * seuls les mouvements utiles sont lus.
 */
export async function stockDe(produitId: IdProduit): Promise<number> {
  const mouvements = await base.mouvements.where('produitId').equals(produitId).toArray()
  return quantiteProduit(produitId, mouvements)
}

/** La quantite en stock de chaque produit d'un rayon. */
export async function stocksDuRayon(rayonId: string): Promise<Map<string, number>> {
  const [liste, mouvements] = await Promise.all([
    produits.duRayon(rayonId),
    base.mouvements.where('rayonId').equals(rayonId).toArray(),
  ])
  const stock = new Map<string, number>()
  for (const p of liste) stock.set(p.id, quantiteProduit(p.id, mouvements))
  return stock
}

/**
 * Le lot dont il faut servir en premier.
 *
 * C'est la fonction qui evite de jeter des medicaments :
 * elle renvoie le lot qui PERIME EN PREMIER s'il y en a un,
 * sinon le lot le plus ancien recu.
 */
export async function lotPrioritaire(produitId: IdProduit): Promise<{ lot: Lot; quantite: number } | undefined> {
  const [tousLots, mouvements] = await Promise.all([
    lots.duProduit(produitId),
    base.mouvements.where('produitId').equals(produitId).toArray(),
  ])

  const ordonnes = lotsParPriorite(produitId, tousLots, mouvements)
  for (const lot of ordonnes) {
    const quantite = quantiteLot(lot.id, mouvements)
    if (quantite > 0) return { lot, quantite }
  }
  return undefined
}

/** Tous les lots servis en premier, avec leur quantite. */
export async function lotsServisEnPremier(produitId: IdProduit): Promise<{ lot: Lot; quantite: number }[]> {
  const [tousLots, mouvements] = await Promise.all([
    lots.duProduit(produitId),
    base.mouvements.where('produitId').equals(produitId).toArray(),
  ])

  return lotsParPriorite(produitId, tousLots, mouvements)
    .map((lot) => ({ lot, quantite: quantiteLot(lot.id, mouvements) }))
    .filter((l) => l.quantite > 0)
}

/* ---------- 4. La chaine du froid ---------- */

export const releves = {
  tous: () => base.relevesTemperature.orderBy('date').reverse().toArray(),
  deLaZone: (zoneId: string) =>
    base.relevesTemperature.where('zoneId').equals(zoneId).reverse().sortBy('date'),
  derniers: (zoneId: string, n = 20) =>
    base.relevesTemperature.where('zoneId').equals(zoneId).reverse().sortBy('date').then((r) => r.slice(0, n)),

  /** Un releve = une ligne. On n'ecrase JAMAIS un releve : c'est
      une trace de temperatures, un controle doit pouvoir les
      relire dans l'ordre. */
  ajouter: async (zoneId: string, valeur: number, date = maintenant()) => {
    const ligne = { id: nouvelId(), zoneId, valeur, date }
    await base.relevesTemperature.add(ligne)
    return ligne
  },
}

/* ---------- 5. Les fournisseurs ---------- */

export const fournisseursDepot = {
  tous: () => base.fournisseurs.toArray(),
  duRayon: (rayonId: string) => base.fournisseurs.where('rayonId').equals(rayonId).toArray(),
  parId: (id: string) => base.fournisseurs.get(id),
  enregistrer: async (nom: string, rayonId: string) => {
    const existant = await base.fournisseurs.where('nom').equalsIgnoreCase(nom).first()
    if (existant) return existant
    const ligne = { id: nouvelId(), rayonId, nom, actif: true }
    await base.fournisseurs.add(ligne)
    return ligne
  },
}

/* ---------- 6. Les utilisateurs ---------- */

export const utilisateurs = {
  tous: () => base.utilisateurs.toArray(),

  enregistrer: async (u: UtilisateurRow) => {
    const dejaLa = await base.utilisateurs.get(u.id)
    if (dejaLa) await base.utilisateurs.put(u)
    else await base.utilisateurs.add(u)
    return u
  },
}

/* ---------- 7. Les demandes d'approbation ---------- */

export const approbations = {
  enAttente: () => base.demandesApprobation.where('statut').equals('en_attente').toArray(),
  toutes: () => base.demandesApprobation.orderBy('date').reverse().toArray(),

  demander: async (d: Omit<DemandeApprobationRow, 'id' | 'statut' | 'date'>) => {
    const ligne: DemandeApprobationRow = {
      ...d, id: nouvelId(), statut: 'en_attente', date: maintenant(),
    }
    await base.demandesApprobation.add(ligne)
    return ligne
  },

  decider: async (id: string, approuve: boolean, approbateurId: string, mandatId?: string) => {
    const d = await base.demandesApprobation.get(id)
    if (!d) throw new Error('Demande introuvable.')
    /* Une demande deja decidee ne se red Decide pas : c'est une
       trace, pas un etat modifiable. */
    if (d.statut !== 'en_attente') throw new Error('Cette demande a déjà été traitée.')
    await base.demandesApprobation.put({
      ...d,
      statut: approuve ? 'approuvee' : 'refusee',
      approbateurId,
      mandatId,
    })
  },
}

/* ---------- 8. Le journal, en lecture ---------- */

export const journal = {
  tous: () => base.mouvements.orderBy('date').reverse().toArray(),
  duProduit: (produitId: IdProduit) =>
    base.mouvements.where('produitId').equals(produitId).reverse().sortBy('date'),
  duLot: (lotId: string) =>
    base.mouvements.where('lotId').equals(lotId).reverse().sortBy('date'),
  deLaDate: (depuis: string) =>
    base.mouvements.where('date').above(depuis).reverse().sortBy('date'),
  enAttenteDeSynchro: () => base.mouvements.where('synchro').equals(0).toArray(),
  marquerSynchro: (ids: string[]) => base.mouvements.where('id').anyOf(ids).modify({ synchro: 1 }),
}

export type { Emplacement, Zone }

/* ---------- 5. Effacer tout (reglages,.tests) ---------- */
export async function toutEffacer(): Promise<void> {
  await Promise.all([
    base.mouvements.clear(), base.lots.clear(), base.produits.clear(),
    base.emplacements.clear(), base.zones.clear(), base.categories.clear(),
    base.fournisseurs.clear(), base.rayons.clear(), base.inventaires.clear(),
    base.lignesInventaire.clear(), base.utilisateurs.clear(),
    base.relevesTemperature.clear(), base.demandesApprobation.clear(),
  ])
}