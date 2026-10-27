import { base } from './base'
import { premierDirecteur, type Utilisateur } from '../domaine/acces'
import { COMPTES_ESSAI, DEMANDES_ESSAI, PRODUITS_ESSAI } from './essaiIds'

/* ============================================================
   EFFACER LES DONNEES D'ESSAI

   Une seule fois, a la premiere ouverture de la version qui a
   retire le jeu d'essai. La migration 5 de la base fait le meme
   travail dans sa propre transaction ; cette fonction existe pour
   les tests, et pour qu'on puisse relire la regle a un seul
   endroit.

   On n'efface que les identifiants connus. Un vrai produit qui
   porte le meme nom n'est pas touche.
   ============================================================ */

export async function effacerDonneesEssai(): Promise<void> {
  await base.transaction(
    'rw',
    base.utilisateurs,
    base.produits,
    base.lots,
    base.mouvements,
    base.demandesApprobation,
    async () => {
      await base.utilisateurs.bulkDelete([...COMPTES_ESSAI])
      await base.produits.bulkDelete([...PRODUITS_ESSAI])
      await base.lots.where('produitId').anyOf([...PRODUITS_ESSAI]).delete()
      await base.mouvements.where('produitId').anyOf([...PRODUITS_ESSAI]).delete()
      await base.demandesApprobation.bulkDelete([...DEMANDES_ESSAI])

      /* Le seul directeur etait peut-etre un faux compte. On
         redonne la direction au premier compte reel, sinon plus
         personne ne peut gerer les personnes. */
      const restants = await base.utilisateurs.toArray()
      const aPromouvoir = premierDirecteur(restants)
      if (aPromouvoir) {
        await base.utilisateurs.put({
          ...aPromouvoir,
          role: 'directeur',
          actif: true,
          enAttente: false,
        } satisfies Utilisateur)
      }
    },
  )
}
