import type { Lot, Mouvement, Produit } from './types'
import { quantiteLot, quantiteProduit } from './stock'
import { aujourdhui, joursAvant } from './temps'

/* ============================================================
   LES ALERTES

   UNE SEULE FONCTION, sans etat ni base de donnees.
   On lui donne des donnees, elle rend des alertes. Comme ca,
   elle se teste en une ligne et elle ne peut pas se desynchroniser.

   Deux niveaux seulement : « agir » et « surveiller ».
   La NATURE de l'alerte est portee par le texte, jamais par
   une couleur de plus.
   ============================================================ */

export type NiveauAlerte = 'agir' | 'surveiller'

export type NatureAlerte =
  | 'perime'
  | 'peremption_proche'
  | 'sous_seuil'
  | 'quarantaine'

export type Alerte = {
  id: string
  niveau: NiveauAlerte
  nature: NatureAlerte
  libelle: string
  detail: string
  produitId?: string
  lotId?: string
  emplacementId?: string
  zoneId?: string
  quantite?: number
  joursRestants?: number
}

/* Jours d'avance pour « perime bientot ». L'OMS et les bonnes
   pratiques de distribution travaillent sur cet ordre de grandeur. */
export const FENETRE_PEREMPTION = 90

export function calculerAlertes({
  produits,
  lots,
  mouvements,
  emplacementsQuarantaine = [],
  reference = aujourdhui(),
}: {
  produits: readonly Produit[]
  lots: readonly Lot[]
  mouvements: readonly Mouvement[]
  emplacementsQuarantaine?: readonly string[]
  reference?: string
}): Alerte[] {
  const alertes: Alerte[] = []
  const enQuarantaine = new Set(emplacementsQuarantaine)

  for (const produit of produits) {
    /* ---------- 1. La peremption, lot par lot ----------
       On ne regarde QUE les lots qui ont de la marchandise.
       Un lot vide et perime ne derange personne. */
    for (const lot of lots) {
      if (lot.produitId !== produit.id) continue
      if (!lot.peremption) continue

      const quantite = quantiteLot(lot.id, mouvements)
      if (quantite <= 0) continue

      const jours = joursAvant(lot.peremption, reference)

      if (jours < 0) {
        alertes.push({
          id: `perime:${lot.id}`,
          niveau: 'agir',
          nature: 'perime',
          libelle: produit.nomFr,
          detail: `Périmé depuis ${Math.abs(jours)} jour${Math.abs(jours) > 1 ? 's' : ''}`,
          produitId: produit.id,
          lotId: lot.id,
          emplacementId: lot.emplacementId,
          quantite,
          joursRestants: jours,
        })
        continue
      }

      if (jours <= FENETRE_PEREMPTION) {
        alertes.push({
          id: `proche:${lot.id}`,
          niveau: 'surveiller',
          nature: 'peremption_proche',
          libelle: produit.nomFr,
          detail: `${jours} jour${jours > 1 ? 's' : ''} — lot ${lot.numero ?? '—'}`,
          produitId: produit.id,
          lotId: lot.id,
          emplacementId: lot.emplacementId,
          quantite,
          joursRestants: jours,
        })
      }
    }

    /* ---------- 2. La quarantaine ---------- */
    for (const lot of lots) {
      if (lot.produitId !== produit.id) continue
      if (!enQuarantaine.has(lot.emplacementId)) continue

      const quantite = quantiteLot(lot.id, mouvements)
      if (quantite <= 0) continue

      alertes.push({
        id: `quarantaine:${lot.id}`,
        niveau: 'surveiller',
        nature: 'quarantaine',
        libelle: produit.nomFr,
        detail: `En attente — lot ${lot.numero ?? '—'}`,
        produitId: produit.id,
        lotId: lot.id,
        emplacementId: lot.emplacementId,
        quantite,
      })
    }

    /* ---------- 3. Le seuil ----------
       Regle simple : il faut commander quand il reste MOINS que
       le seuil. Un produit a 0 n'est pas traite a part : il est
       plus grave qu'un produit sous le seuil, pas different. */
    const stock = quantiteProduit(produit.id, mouvements)
    if (stock <= produit.seuil) {
      alertes.push({
        id: `seuil:${produit.id}`,
        niveau: 'agir',
        nature: 'sous_seuil',
        libelle: produit.nomFr,
        detail: stock === 0 ? 'Rupture' : `Il reste ${stock} — seuil ${produit.seuil}`,
        produitId: produit.id,
        quantite: stock,
      })
    }
  }

  /* Le plus urgent en premier : perimes, puis ruptures,
     puis bientot perime, puis quarantaine. */
  const ordre = { agir: 0, surveiller: 1 }
  return alertes.sort((a, b) => {
    if (ordre[a.niveau] !== ordre[b.niveau]) return ordre[a.niveau] - ordre[b.niveau]
    if (a.nature !== b.nature) return NATURES.indexOf(a.nature) - NATURES.indexOf(b.nature)
    return (a.joursRestants ?? 9999) - (b.joursRestants ?? 9999)
  })
}

const NATURES: NatureAlerte[] = ['perime', 'sous_seuil', 'peremption_proche', 'quarantaine']

/* ---------- Les compteurs pour l'ecran d'accueil ---------- */

export type CompteursAlertes = { agir: number; surveiller: number; total: number }

export function compterAlertes(alertes: readonly Alerte[]): CompteursAlertes {
  const agir = alertes.filter((a) => a.niveau === 'agir').length
  const surveiller = alertes.length - agir
  return { agir, surveiller, total: alertes.length }
}