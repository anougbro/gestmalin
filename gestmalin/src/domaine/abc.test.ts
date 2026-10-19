import { describe, expect, it } from 'vitest'
import { classer, calculerABC, repartition, rotationsParProduit, FENETRE_ABC_JOURS } from './abc'
import type { Mouvement } from './types'

/* ============================================================
   LA CLASSIFICATION ABC

   Le champ existait dans le modele de donnees depuis le debut,
   declare et jamais calcule. Une regle ecrite et non appliquee
   est pire qu'une regle absente : le cahier des charges promet
   un comptage tournant, et l'ecran ne sait pas dire qui compter.
   ============================================================ */

/* Un produit est construit ici avec le minimum de mouvement, et
   autant de mouvements qu'on veut. */
let compteur = 0
function sortie(produitId: string, quantite: number, date: string, motif?: string): Mouvement {
  compteur++
  return {
    id: `m${compteur}`,
    type: 'sortie',
    rayonId: 'r-med',
    produitId,
    quantite,
    date,
    auteurId: 'u1',
    ...(motif ? { motif } : {}),
  } as Mouvement
}

/* Reference fixe : le test ne doit pas dependre du jour ou il
   tourne. */
const AUJOURDHUI = '2026-10-19'

describe('compter les rotations', () => {
  it('une sortie vaut une rotation', () => {
    const r = rotationsParProduit([sortie('p1', 3, '2026-10-10')], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.get('p1')).toBe(3)
  })

  it('une sortie de dix boites vaut dix rotations', () => {
    /* C est la quantite qui compte, pas le nombre de gestes :
       un distributeur de dix boites d'un coup sollicite bien
       plus le stock qu'un jeton de un. */
    const r = rotationsParProduit([sortie('p1', 10, '2026-10-10')], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.get('p1')).toBe(10)
  })

  it('ce qui est sorti il y a plus de 90 jours est ignore', () => {
    /* Sans fenetre, un produit sorti une fois en 2019 passerait
       pour un produit lent alors qu'il est simplement arrete. */
    const vieux = sortie('p1', 5, '2026-01-01')
    const recent = sortie('p2', 2, '2026-10-15')
    const r = rotationsParProduit([vieux, recent], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.has('p1')).toBe(false)
    expect(r.get('p2')).toBe(2)
  })

  it('un ecart d inventaire n est pas une rotation', () => {
    /* C est la consequence d un comptage, pas un geste du
       produit. Le compter gonflerait la rotation d un produit
       que l on vient justement de constater faux. */
    const r = rotationsParProduit([sortie('p1', 5, '2026-10-10', 'ecart_inventaire')], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.get('p1')).toBeUndefined()
  })

  it('une date dans le futur est ignoree', () => {
    /* Une horloge de telephone peut se tromper. Un mouvement
       date de demain ne doit pas peser dans le classement. */
    const r = rotationsParProduit([sortie('p1', 5, '2026-12-01')], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.has('p1')).toBe(false)
  })

  it('les receptions ne comptent pas comme des rotations', () => {
    const r = rotationsParProduit(
      [{ ...sortie('p1', 1, '2026-10-10'), type: 'reception' } as Mouvement],
      FENETRE_ABC_JOURS,
      AUJOURDHUI,
    )
    expect(r.has('p1')).toBe(false)
  })
})

describe('classer', () => {
  const cls = (n: number, nb = 1) => new Map(Array.from({ length: nb }, (_, i) => [`p${i}`, n] as const))

  it('rien ne tourne : tout est C', () => {
    /* Le cas le plus frequent d une officine qui demarre. Sans
       ce cas, le premier produit de la liste passerait A avec
       un cumule de zero : le plus immobile serait classe comme
       le plus important. */
    const r = classer(cls(0, 5))
    expect([...r.values()].every((c) => c === 'C')).toBe(true)
  })

  it('un seul produit qui tourne est A', () => {
    expect(classer(cls(10)).get('p0')).toBe('A')
  })

  it('la tete de la distribution est A', () => {
    const r = classer(cls(100, 1))
    expect(r.get('p0')).toBe('A')
  })

  it('la queue longue est C', () => {
    /* Un produit quasi immobile, devant une reference qui
       sort sans arret. */
    const comptes = new Map([['a', 100], ['b', 1]])
    const r = classer(comptes)
    expect(r.get('a')).toBe('A')
    expect(r.get('b')).toBe('C')
  })

  it('le pivot suit la regle 80 / 95', () => {
    /* 100 rotations au total.
       A  : jusqu a 80 de la rotation cumulee
       B  : de 80 a 95
       C  : au-dela de 95 */
    const comptes = new Map([['a', 50], ['b', 30], ['c', 15], ['d', 4], ['e', 1]])
    const r = classer(comptes)
    expect(r.get('a')).toBe('A')   /* 0 %   -> 50 % cumule */
    expect(r.get('b')).toBe('A')   /* 50 %  -> 80 % cumule */
    expect(r.get('c')).toBe('B')   /* 80 %  -> 95 % cumule */
    expect(r.get('d')).toBe('C')
    expect(r.get('e')).toBe('C')
  })

  it('deux produits a egalite sont dans la meme categorie', () => {
    /* C est la regle qui rend le classement honnete. Sans elle,
       deux produits sortis dix fois chacun se retrouvent A et B
       selon l ordre du tri — c est-a-dire au hasard. */
    const comptes = new Map([['a', 10], ['b', 10], ['c', 1]])
    const r = classer(comptes)
    expect(r.get('a')).toBe(r.get('b'))
    expect(r.get('a')).toBe('A')
  })

  it('tous a egalite donne une seule categorie, pas trois', () => {
    const r = classer(cls(7, 8))
    const valeurs = new Set(r.values())
    expect(valeurs.size).toBe(1)
  })

  it('un mouvement seul ne rend pas tout A', () => {
    /* Un seul produit qui bouge sur dix references immobiles
       reste un A, mais les dix autres ne doivent pas suivre
       par contagion du tri. */
    const comptes = new Map([['actif', 4], ...Array.from({ length: 10 }, (_, i) => [`fige${i}`, 0] as const)])
    const r = classer(comptes)
    expect(r.get('actif')).toBe('A')
    expect(r.get('fige0')).toBe('C')
  })

  it('une table de millionnaire ne donne pas une classe de rotation', () => {
    /* 10 000 rotations sur un produit, puis dix produits a 1.
       Le premier est A. Les dix autres se partagent le reste du
       cumule : ils doivent tomber en C, pas en B. */
    const comptes = new Map<string, number>([['grand', 10000]])
    for (let i = 0; i < 10; i++) comptes.set(`p${i}`, 1)
    const r = classer(comptes)
    expect(r.get('grand')).toBe('A')
    expect(r.get('p0')).toBe('C')
    expect(r.get('p9')).toBe('C')
  })
})

describe('de la base au classement', () => {
  it('un produit sans aucun mouvement n apparait pas', () => {
    /* Il n est pas dans la Map : l ecran doit alors le classer C
       par defaut plutot que de pretendre qu il est A. */
    const r = calculerABC([], FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.size).toBe(0)
  })

  it('les mouvements se traduisent en categories', () => {
    const mouvements = [
      sortie('vif', 60, '2026-10-01'),
      sortie('moyen', 20, '2026-10-01'),
      sortie('lent', 2, '2026-10-01'),
    ]
    const r = calculerABC(mouvements, FENETRE_ABC_JOURS, AUJOURDHUI)
    expect(r.get('vif')).toBe('A')
    expect(r.get('moyen')).toBe('A')
    expect(r.get('lent')).toBe('C')
  })
})

describe('la repartition affichee', () => {
  it('compte les references de chaque categorie', () => {
    const produits = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const categories = new Map([['a', 'A' as const], ['b', 'B' as const], ['c', 'C' as const]])
    const r = repartition(produits, categories)
    expect(r).toEqual({ A: 1, B: 1, C: 2 })
  })

  it('un produit jamais classe compte en C', () => {
    const r = repartition([{ id: 'inconnu' }], new Map())
    expect(r.C).toBe(1)
  })
})