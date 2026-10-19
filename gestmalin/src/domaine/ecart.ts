/* ============================================================
   LA NATURE D'UN ECART

   Le comptage est impartial : la quantite attendue n'est pas
   montree. Mais un ecart ne peut pas etre accepte aveuglement.
   Une erreur de saisie et une vraie perte produisent le meme
   chiffre ; le seul moyen de les distinguer est de recompter.

   D'ou la regle du cahier des charges : un ecart ordinaire est
   accepte, un ecart important declenche une demande de RECOMPTE
   A DEUX avant validation.

   Ce module ne fait que classer l'ecart. Il ne dit pas ce qu'il
   faut faire — ca, c'est l'ecran. Il dit seulement de quelle
   nature il s'agit, ce qui se teste ligne par ligne.

   Le seuil est unique et nomme : deux seuils qui divergent
   selon les fichiers finissent toujours par diverger.
   ============================================================ */

/* En dessous de ce nombre de boites, un ecart ressemble a une
   erreur de frappe — on tape 1 pour 10, on tape 3 pour 8. Ce
   n'est pas une perte, et faire recompter ces produits a chaque
   inventaire rendrait le controle inutile : il declencherait
   partout, donc personne n'y ferait attention. */
export const ECART_MINIMUM = 2

/* Au-dela de ce pourcentage de la quantite attendue, l'ecart
   est trop gros pour etre une faute de frappe. */
export const SEUIL_ECART_PCT = 25

/* ATTENTION — cette fonction n'est pas symetrique, et elle ne doit
   pas l'etre.

   Perdre 5 boites sur un stock de 21 reste sous le seuil (24 %).
   En trouver 5 sur un stock de 16 le depasse (31 %). Ce n'est pas
   une injustice : cinq boites sont une proportion bien plus
   grave sur seize que sur vingt-et-un, et c'est la PROPORTION
   qui compte.

   C'est aussi ce qui rend le controle comparable entre un rayon
   de cinquante references et un rayon de trois cents, et ce qui
   met le seuil ABC et le seuil d'ecart d'accord entre eux. Un
   seuil en nombre de boites aurait l'air plus simple et
   fonctionnerait uniquement sur le rayon le plus petit.
   -------------------------------------------------------------- */

export type NatureEcart =
  /** Ce qui est compte et ce qui etait attendu : rien a signaler. */
  | 'rien'
  /** Un ecart ordinaire : il sera enregistre tel quel. */
  | 'ordinaire'
  /** Un ecart qui doit etre recompte avant d etre enregistre. */
  | 'important'

export function natureEcart(
  attendue: number,
  trouvee: number,
  seuilPct = SEUIL_ECART_PCT,
): NatureEcart {
  if (trouvee === attendue) return 'rien'

  /* Du stock que l'application ne connaissait pas : une reception
     oubliee. L'ecart est de 100 %, il ne peut pas etre une
     erreur de frappe. */
  if (attendue === 0) return 'important'

  /* Le produit a disparu des leges. C'est la perte la plus
     grave qui soit, et celle qu'un recompte a deux distingue le
     plus facilement. */
  if (trouvee === 0) return 'important'

  const ecart = Math.abs(trouvee - attendue)
  if (ecart < ECART_MINIMUM) return 'ordinaire'
  if ((ecart / attendue) * 100 >= seuilPct) return 'important'

  return 'ordinaire'
}

/* ---------- L'ecart, en clair ---------- */

export type Ecart = {
  /** Nombre signe : positif = trouve en trop, negatif = manque. */
  valeur: number
  nature: NatureEcart
  /** 'manque' ou 'en trop' — le mot a afficher, jamais un signe. */
  sens: 'rien' | 'manque' | 'en trop'
}

export function ecart(attendue: number, trouvee: number, seuilPct = SEUIL_ECART_PCT): Ecart {
  const valeur = trouvee - attendue
  return {
    valeur,
    nature: natureEcart(attendue, trouvee, seuilPct),
    sens: valeur === 0 ? 'rien' : valeur < 0 ? 'manque' : 'en trop',
  }
}