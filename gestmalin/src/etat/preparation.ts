import { base, ATTENTE_ID } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { RAYONS_PAR_DEFAUT, ZONES_PAR_DEFAUT, emplacementsDeZone } from './rayons'
import { empreinte, type Utilisateur } from '../domaine/acces'

/* ============================================================
   LE PREMIER AMORCAGE

   A la toute premiere ouverture, la base est vide : on y met
   les deux rayons, leurs zones, leurs emplacements, le quai de
   reception, et la personne qui travaille ici.

   Ce n'est PAS une donnee de demonstration : c'est la structure
   physique de la pharmacie. Les produits, eux, viendront par
   import ou saisie — on n'invente pas de medicaments.
   ============================================================ */

/* Le code de la personne creee au premier lancement.
   1234 est volontaire : c'est le code le plus facile a retenir
   pour une premiere connexion, et il se change aussitot.
   Il n'est stocke qu'en empreinte. */
export const CODE_INITIAL = '1234'

export const UTILISATEUR_INITIAL: Omit<Utilisateur, 'empreinte'> = {
  id: 'u-1',
  nom: 'Préparateur',
  role: 'preparateur',
  rayonsAutorises: ['r-med', 'r-men'],
  actif: true,
}

export async function demarrer() {
  await toutEffacer()
  await base.rayons.bulkAdd(RAYONS_PAR_DEFAUT.map((r, i) => ({ ...r, ordre: i })))
  await base.zones.bulkAdd(ZONES_PAR_DEFAUT)

  await base.emplacements.bulkAdd(ZONES_PAR_DEFAUT.flatMap((z) => emplacementsDeZone(z.id)))

  /* Le quai de reception : une position reelle qui n'appartient
     a aucune zone. Tout ce qui arrive passe par la avant d'etre pose. */
  await base.emplacements.put({ id: ATTENTE_ID, zoneId: '', code: 'QUAI', ordre: 0 })

  await base.utilisateurs.put({
    ...UTILISATEUR_INITIAL,
    empreinte: empreinte(UTILISATEUR_INITIAL.id, CODE_INITIAL),
  })
}

/** L'application a-t-elle deja ete preparee ? */
export async function dejaPreparee(): Promise<boolean> {
  return (await base.rayons.count()) > 0
}