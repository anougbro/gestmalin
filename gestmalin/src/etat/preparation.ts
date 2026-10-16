import { base, ATTENTE_ID } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { RAYONS_PAR_DEFAUT, ZONES_PAR_DEFAUT, emplacementsDeZone } from './rayons'

/* ============================================================
   LE PREMIER AMORCAGE

   A la toute premiere ouverture, la base est vide : on y met
   les deux rayons, leurs zones, leurs emplacements, et le quai
   de reception.

   Ce n'est PAS une donnee de demonstration : c'est la structure
   physique de la pharmacie. Les produits, eux, viendront par
   import ou saisie — on n'invente pas de medicaments.
   ============================================================ */

export async function demarrer() {
  await toutEffacer()
  await base.rayons.bulkAdd(RAYONS_PAR_DEFAUT.map((r, i) => ({ ...r, ordre: i })))
  await base.zones.bulkAdd(ZONES_PAR_DEFAUT)

  await base.emplacements.bulkAdd(ZONES_PAR_DEFAUT.flatMap(emplacementsDeZone))

  /* Le quai de reception : une position reelle qui n'appartient
     a aucune zone. Tout ce qui arrive passe par la avant d'etre pose. */
  await base.emplacements.put({ id: ATTENTE_ID, zoneId: '', code: 'QUAI', ordre: 0 })

  await base.utilisateurs.put({
    id: 'u-1', nom: 'Préparateur', role: 'preparateur',
    rayonsAutorises: ['r-med', 'r-men'], actif: true,
  })
}

/** L'application a-t-elle deja ete preparee ? */
export async function dejaPreparee(): Promise<boolean> {
  return (await base.rayons.count()) > 0
}