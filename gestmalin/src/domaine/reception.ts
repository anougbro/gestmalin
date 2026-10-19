import { LONGUEUR_PLAUSIBLE, type CodeLu } from './codeBarres'
import type { Produit } from './types'

/* ============================================================
   QUE FAIRE D'UN CODE QUI VIENT D'ETRE LU ?

   La question est posee deux fois par jour, dans deux écrans :
   la reception et la sortie. Elle meritait une seule reponse,
   ecrite une fois.

   Elle est ici, hors de tout composant React, pour deux raisons :

   1. Elle se teste sans navigateur. Une decision prise dans un
      composant ne se verifie qu'en simulant un telephone entier,
      avec une camera, dans un etat precis. C'est exactement le
      genre de test qu'on ecrit... puis qu'on ne relance pas.

   2. Elle ne depend que de ses arguments. La base n'apparait
      que comme une valeur deja cherchee, pas comme une connexion.
      Un seul `await produits.parCodeBarres()` dans l'ecran, et
      la decision se raisonne ici.

   Le produit a TROIS destinations possibles, et les confondre
   coute des minutes de recherche dans une officine :

     - il est au catalogue et dans le rayon ouvert : on sert.
     - il est au catalogue mais dans l'AUTRE rayon : il existe,
       et dire « code inconnu » est un mensonge. La personne
       croira que sa boite n'est pas referencee.
     - il n'est pas au catalogue : c'est le cas le plus courant
       le premier jour d'une officine, et ce n'est pas une
       erreur. On propose de creer la fiche, code deja rempli.
   ============================================================ */

export type SuiteScan =
  /** Le produit est la. Il ne reste qu'a choisir la quantite. */
  | { cas: 'produit'; produit: Produit; lot: string; peremption: string }
  /** Le produit existe, mais pas dans le rayon ouvert. */
  | { cas: 'autre-rayon'; produit: Produit; nomRayon: string }
  /** Le produit n'existe pas encore. Il reste un nom a demander. */
  | { cas: 'a-creer'; gtin: string; lot: string; peremption: string }
  /** Ce qui a ete lu n'est pas un code-barres exploitable. */
  | { cas: 'illisible'; brut: string }

export function suiteDuCode(
  code: CodeLu,
  rayonId: string,
  /** Le produit trouve en base, ou `null` s'il n'existe pas. */
  trouve: Produit | null | undefined,
  /** Resout un identifiant de rayon en nom lisible. */
  nomDuRayon: (id: string) => string | undefined,
): SuiteScan {
  /* Un code qu'on ne sait pas lire ne se regle pas en creant un
     produit : creer une fiche avec un code fantome pollue le
     catalogue pour toujours. */
  if (!code.gtin || !LONGUEUR_PLAUSIBLE(code.gtin)) {
    return { cas: 'illisible', brut: code.brut }
  }

  if (!trouve) {
    return {
      cas: 'a-creer',
      gtin: code.gtin,
      lot: code.lot ?? '',
      peremption: code.peremption ?? '',
    }
  }

  if (trouve.rayonId !== rayonId) {
    return { cas: 'autre-rayon', produit: trouve, nomRayon: nomDuRayon(trouve.rayonId) ?? 'un autre rayon' }
  }

  return {
    cas: 'produit',
    produit: trouve,
    lot: code.lot ?? '',
    peremption: code.peremption ?? '',
  }
}