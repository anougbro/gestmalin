import { joursAvant } from './temps'
import type { IdProduit, Mouvement } from './types'

/* ============================================================
   LA CLASSIFICATION ABC

   A quoi elle sert, exactement : a dire ce qu'il faut compter
   SOUVENT. Pas a classer des valeurs — l'application n'a aucun
   prix, aucun montant, et n'en aura jamais.

   Un produit a 2 000 FCFA sorti vingt fois par jour se trompe
   bien plus souvent qu'un produit a 150 000 FCFA sorti deux fois
   par mois. Ce n'est pas le produit cher qui derive, c'est celui
   qui bouge. Classer par rotation vise donc directement le
   risque d'erreur.

   D'ou la decision du cahier des charges : Apres 90 jours :

     A  forte rotation  ->  compte chaque semaine
     B  intermediaire   ->  compte chaque mois
     C  faible rotation ->  compte chaque trimestre

   Un produit sans AUCUNE sortie sur la periode est classe C par
   defaut. On ne peut pas prouver qu'un produit rare est stable :
   on peut seulement constater qu'il ne bouge pas, ce qui est une
   raison de le compter de temps en temps — pas de l'ignorer.
   ============================================================ */

export type CategorieABC = 'A' | 'B' | 'C'

export const FENETRE_ABC_JOURS = 90

/* Les frequences de comptage, dans les mots de l'ecran. */
export const FREQUENCE_COMPTE: Record<CategorieABC, string> = {
  A: 'chaque semaine',
  B: 'chaque mois',
  C: 'chaque trimestre',
}

/* ---------- Combien de fois un produit est sorti ? ---------- */

export function rotationsParProduit(
  mouvements: Mouvement[],
  fenetreJours = FENETRE_ABC_JOURS,
  reference?: string,
): Map<IdProduit, number> {
  const comptes = new Map<IdProduit, number>()

  for (const m of mouvements) {
    /* Seules les SORTIES comptent. Une reception ne consomme
       rien, et un transfert ne change pas le total du rayon.
       Une perte n est pas davantage une rotation : c est un
       accident, pas de la demande. Un produit qui ne sort
       que parce qu il perime est precisement un produit qu il
       faut compter regulierement - pas un produit vif. */
    if (m.type !== 'sortie') continue

    /* Une sortie d inventaire n est pas une rotation : c est la
       consequence d un comptage, pas un geste de la vie du
       produit. Compter ces mouvements gonflerait la rotation
       d un produit que l on vient justement de constater faux. */
    if (m.motif === 'ecart_inventaire') continue

    /* ATTENTION AU SENS : `joursAvant` renvoie une valeur
       POSITIVE pour une date a venir, et negative pour une
       date passee. C est l inverse de ce que le mot « avant »
       laisse croire, et l inverser fait ignorer tout l historique
       recent tout en acceptant des dates futures. */
    const ecart = joursAvant(m.date.slice(0, 10), reference)
    if (ecart > 0) continue          /* horloge du telephone erronee */
    const age = -ecart                /* jours depuis le mouvement */
    if (age > fenetreJours) continue  /* trop ancien pour la fenetre */

    comptes.set(m.produitId, (comptes.get(m.produitId) ?? 0) + m.quantite)
  }

  return comptes
}

/* ---------- Le classement ---------- */

export function calculerABC(
  mouvements: Mouvement[],
  fenetreJours = FENETRE_ABC_JOURS,
  reference?: string,
): Map<IdProduit, CategorieABC> {
  const comptes = rotationsParProduit(mouvements, fenetreJours, reference)
  return classer(comptes)
}

/* La regle de repartition, separee de la lecture des
   mouvements : c'est elle qu'on teste, et elle n'a rien a faire
   avec la base. */
export function classer(comptes: Map<IdProduit, number>): Map<IdProduit, CategorieABC> {
  const resultat = new Map<IdProduit, CategorieABC>()

  /* Chaque produit absent du classement est classe C : il n'a
     pas bouge, donc on le compte de temps en temps. */
  if (comptes.size === 0) return resultat

  const tries = [...comptes.entries()].sort((a, b) => b[1] - a[1])
  const total = tries.reduce((s, [, n]) => s + n, 0)

  /* Aucune sortie sur toute la periode : personne ne bouge, donc
     personne n'est A. Sans ce cas, la premiere ligne passerait
     en A avec un cumule de zero, et le produit le plus immobile
     serait classe comme le plus important. */
  if (total === 0) {
    for (const [id] of tries) resultat.set(id, 'C')
    return resultat
  }

  let cumule = 0
  let i = 0
  while (i < tries.length) {
    const n = tries[i][1]

    /* On regroupe par valeur egale AVANT de classer. Deux
       produits sortis dix fois chacun ne peuvent pas, par
       hasard de l'ordre du tri, se retrouver dans deux
       categories differentes : ils sont, par definition,
       aussi importants l'un que l'autre. */
    let j = i
    while (j < tries.length && tries[j][1] === n) j++

    const partAvant = cumule / total
    const categorie: CategorieABC = partAvant < 0.80 ? 'A' : partAvant < 0.95 ? 'B' : 'C'

    for (let k = i; k < j; k++) resultat.set(tries[k][0], categorie)
    cumule += n * (j - i)
    i = j
  }

  return resultat
}

/* ---------- Pour l'ecran ---------- */

/* Combien de references A, B et C — le total, pour la ligne
   « cette semaine ». */
export function repartition(
  produits: Array<{ id: IdProduit }>,
  categories: Map<IdProduit, CategorieABC>,
): Record<CategorieABC, number> {
  const total: Record<CategorieABC, number> = { A: 0, B: 0, C: 0 }
  for (const p of produits) total[categories.get(p.id) ?? 'C']++
  return total
}

/* A-et-B : ce qu'il faut compter en urgence. Le C ne disparait
   pas pour autant, il attend son trimestre. */
export function aCompterEnPriorite(
  produits: Array<{ id: IdProduit }>,
  categories: Map<IdProduit, CategorieABC>,
): Array<{ id: IdProduit; categorie: CategorieABC }> {
  return produits
    .map((p) => ({ id: p.id, categorie: categories.get(p.id) ?? 'C' as CategorieABC }))
    .filter((p) => p.categorie !== 'C')
}
