import { base } from '../donnees/base'
import { aLeDroit, type Utilisateur } from '../domaine/acces'

/* ============================================================
   DEPLACER UNE PERSONNE D'UN RAYON A L'AUTRE

   Une seule fonction, une seule table. Les reglages s'en servent,
   et rien d'autre ne modifie `rayonsAutorises` a la main : une
   ecriture faite a deux endroits finit par diverger, et c'est
   toujours la version sans controle qui survit.

   Le refus qui compte est le second. Se retirer son propre rayon
   depuis les reglages, sur un telephone sans serveur, revient a
   se verrouiller dehors : plus de produit dans son rayon, plus
   d'acces, et personne pour rouvrir la base. Le coup est
   irreversible.

   Se déplacer vers un rayon qu'on ne gère pas soi-même est refusé
   pour la meme raison, par un autre chemin. */
export async function deplacerVersRayon(
  id: string,
  rayonId: string,
  auteur: Utilisateur | null,
): Promise<string | null> {
  if (!auteur || !aLeDroit(auteur.role, 'utilisateurs')) {
    return "Tu n'as pas le droit de déplacer quelqu'un."
  }

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  if (auteur.id === id) {
    /* Se garder soi-meme est permis — un directeur peut
       volontairement se limiter a un seul rayon. Se retirer,
       non : c'est sans retour. */
    if (!u.rayonsAutorises.includes(rayonId)) {
      return "Tu ne peux pas te retirer ton propre rayon."
    }
  } else if (!auteur.rayonsAutorises.includes(rayonId)) {
    return "Tu ne peux pas attribuer un rayon que tu ne gères pas."
  }

  await base.utilisateurs.put({ ...u, rayonsAutorises: [rayonId] })
  return null
}