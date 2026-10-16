/* La liste des rayons et le premier amorcage de la pharmacie.
   Isolé dans son propre fichier : un fichier de composants ne
   doit exporter que des composants, sinon le rechargement à chaud
   de React devient imprécis. */

export type RayonTravail = { id: string; nom: string; ton: 'teal' | 'amb' }

export const RAYONS_PAR_DEFAUT: RayonTravail[] = [
  { id: 'r-med', nom: 'Médicaments', ton: 'teal' },
  { id: 'r-men', nom: 'Ménagers', ton: 'amb' },
]

export const ZONES_PAR_DEFAUT = [
  { id: 'z-sec', rayonId: 'r-med', nom: 'Réserve sèche', type: 'reserve_seche' as const },
  { id: 'z-froi', rayonId: 'r-med', nom: 'Réserve froide', type: 'reserve_froide' as const },
  { id: 'z-vit', rayonId: 'r-med', nom: 'Vitrine', type: 'vitrine' as const },
  { id: 'z-qua', rayonId: 'r-med', nom: 'Quarantaine', type: 'quarantaine' as const },
  { id: 'z-reb', rayonId: 'r-med', nom: 'Rebut', type: 'rebut' as const },
  { id: 'z-men', rayonId: 'r-men', nom: 'Rayon ménage', type: 'reserve_seche' as const },
]

/* Dix emplacements par zone : SEC1 a SEC10, FRO1 a FRO10… */
export const EMPLACEMENTS_PAR_ZONE = 10

/** Les deux emojis de rayon, en 1..10. */
export function emplacementsDeZone(zoneId: string): { id: string; zoneId: string; code: string; ordre: number }[] {
  const prefixe = zoneId.split('-')[1].toUpperCase()
  return Array.from({ length: EMPLACEMENTS_PAR_ZONE }, (_, i) => ({
    id: `${zoneId}-e${i + 1}`,
    zoneId,
    code: `${prefixe}${i + 1}`,
    ordre: i + 1,
  }))
}