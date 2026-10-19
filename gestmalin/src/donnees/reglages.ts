import { base, type Reglage } from './base'

/* ============================================================
   A QUEL RAYON APPARTIENT CE TELEPHONE ?

   Chaque personne a SON telephone. Les medicaments d'un cote, les
   produits menagers de l'autre, dans deux bases qui ne se parlent
   pas : c'est le modele retenu, et il est bon.

   Il a une consequence qu'il faut nommer. Une saisie faite du
   mauvais cote n'est pasvue par personne : l'apothicaire ne
   verrait pas du savon enregistre par le gestmalinier sous
   « Medicaments », et celui-ci ne verrait pas l'inverse. Aucun
   message, aucune alerte — la donnee serait simplement perdue.

   D'ou cette table : le telephone retient sur quel rayon il
   travaille, et le premier compte cesse d'avoir les deux.

   Elle ne remplace pas le controle d'acces. `rayonsAutorises` reste
   la source de verite, testee dans `domaine/acces.ts`. Ce reglage
   dit a quel point de depart se poser la question, une fois.
   ============================================================ */

const CLE_TELEPHONE = 'telephone'

export const COMPTE_INITIAL = 'u-1'

/** Le rayon auquel ce telephone est rattache, ou null s'il ne l'est pas encore. */
export async function rayonDuTelephone(): Promise<string | null> {
  const r = await base.reglages.get(CLE_TELEPHONE)
  return r?.rayon ?? null
}

/**
 * Rattache ce telephone a un rayon.
 *
 * Deux gestes indissociables : on retient le rayon sur le
 * telephone, ET on retire le rayon interdit au premier compte.
 *
 * Le second compte est le point de fuite. Filtrer l'affichage ne
 * suffit pas : si le compte garde les deux rayons, la moindre
 * ligne de code qui oublie le filtre rouvre la porte. Un acces se
 * retire a la source, jamais dans la vue.
 */
export async function rattacherTelephone(rayonId: string): Promise<void> {
  await base.transaction('rw', base.reglages, base.utilisateurs, async () => {
    await base.reglages.put({ cle: CLE_TELEPHONE, rayon: rayonId } satisfies Reglage)

    const compte = await base.utilisateurs.get(COMPTE_INITIAL)
    if (compte && compte.rayonsAutorises.length > 1) {
      await base.utilisateurs.put({ ...compte, rayonsAutorises: [rayonId] })
    }
  })
}