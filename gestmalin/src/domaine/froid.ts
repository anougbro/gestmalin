import type { Alerte } from './alertes'
import type { ReleveTemperature } from './types'
import { joursAvant } from './temps'

/* ============================================================
   LA CHAINE DU FROID

   Exigence des bonnes pratiques de distribution, et vrai risque
   en climat chaud : un frigo de pharmacie coupe trois heures,
   et tout ce qu'il contient est perdu.

   La regle : deux releves par jour, matin et soir. Des que la
   temperature sort de la plage 2-8 °C, on le signale. Au-dela
   de 48 heures consecutives hors plage, le lot part en
   quarantaine : on ne vend pas un produit dont on n'a pas la
   certitude qu'il est encore bon.
   ============================================================ */

export const PLAGE_MIN = 2
export const PLAGE_MAX = 8

export const HEURES_HORS_PLAGE = 48
export const HEURES_PAR_JOUR = 24

export function dansLaPlage(valeur: number): boolean {
  return Number.isFinite(valeur) && valeur >= PLAGE_MIN && valeur <= PLAGE_MAX
}

export function horsPlage(valeur: number): boolean {
  return Number.isFinite(valeur) && !dansLaPlage(valeur)
}

/**
 * Les releves hors plage qui se suivent sans interruption.
 *
 * Un relevé normal dans la suite remet le compteur à zéro : un
 * coup de froid de dix minutes suivi de trois degrés n'a rien
 * détruit. C'est la CONTINUITÉ qui compte, pas le nombre.
 */
export function serieHorsPlage(releves: readonly ReleveTemperature[]): ReleveTemperature[] {
  const tries = [...releves].sort((a, b) => a.date.localeCompare(b.date))
  const serie: ReleveTemperature[] = []
  for (let i = tries.length - 1; i >= 0; i--) {
    if (!horsPlage(tries[i].valeur)) break
    serie.unshift(tries[i])
  }
  return serie
}

/** Combien d'heures la serie actuelle dure. */
export function dureeHorsPlage(releves: readonly ReleveTemperature[], maintenant: string): number {
  const serie = serieHorsPlage(releves)
  if (serie.length === 0) return 0
  const premier = serie[0].date
  return Math.max(0, Math.round((Date.parse(maintenant) - Date.parse(premier)) / 3_600_000))
}

/** Faut-il mettre le contenu de cette zone en quarantaine ? */
export function quarantaineRequise(releves: readonly ReleveTemperature[], maintenant: string): boolean {
  return dureeHorsPlage(releves, maintenant) >= HEURES_HORS_PLAGE
}

export type EtatFroid = {
  valeur?: number
  dansLaPlage: boolean
  dureeHorsPlage: number
  quarantaineRequise: boolean
  alertes: Alerte[]
}

export function etatFroid(
  releves: readonly ReleveTemperature[],
  zoneId: string,
  maintenant: string,
  produitsTouches: { produitId: string; libelle: string; quantite: number; lotId?: string }[] = [],
): EtatFroid {
  const serie = serieHorsPlage(releves)
  const dernier = serie[serie.length - 1]
  const duree = dureeHorsPlage(releves, maintenant)
  const quarantaine = quarantaineRequise(releves, maintenant)

  const alertes: Alerte[] = []

  if (dernier && horsPlage(dernier.valeur)) {
    alertes.push({
      id: `froid:${zoneId}:${dernier.id}`,
      niveau: quarantaine ? 'agir' : 'surveiller',
      nature: 'quarantaine',
      libelle: 'Réserve froide',
      detail: `${dernier.valeur.toFixed(1)} °C — hors de la plage ${PLAGE_MIN}-${PLAGE_MAX} °C`,
      zoneId,
    })
  }

  /* Chaque produit present dans la zone est signale separement :
     c'est le pharmacien qui doit savoir CE QU'il faut sortir. */
  if (quarantaine) {
    for (const p of produitsTouches) {
      alertes.push({
        id: `froid-produit:${zoneId}:${p.lotId ?? p.produitId}`,
        niveau: 'agir',
        nature: 'quarantaine',
        libelle: p.libelle,
        detail: 'En réserve froide hors plage',
        produitId: p.produitId,
        lotId: p.lotId,
        quantite: p.quantite,
        zoneId,
      })
    }
  }

  return {
    valeur: dernier?.valeur,
    dansLaPlage: dernier ? dansLaPlage(dernier.valeur) : true,
    dureeHorsPlage: duree,
    quarantaineRequise: quarantaine,
    alertes,
  }
}

/* ---------- L'affichage ---------- */

export function decrireEtat(etat: EtatFroid): string {
  if (etat.dureeHorsPlage === 0) {
    return etat.valeur === undefined
      ? 'Aucun relevé'
      : `${etat.valeur.toFixed(1)} °C — conforme`
  }
  const h = etat.dureeHorsPlage
  const duree = h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h`
  return `${etat.valeur!.toFixed(1)} °C depuis ${duree}`
}

export function joursAvantPeremption(peremption: string | undefined, maintenant: string): number | undefined {
  return peremption ? joursAvant(peremption, maintenant) : undefined
}