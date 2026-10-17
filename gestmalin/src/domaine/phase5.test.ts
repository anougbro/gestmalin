import { describe, expect, it } from 'vitest'
import {
  PLAGE_MIN, PLAGE_MAX, dansLaPlage, horsPlage, serieHorsPlage,
  dureeHorsPlage, quarantaineRequise, etatFroid, decrireEtat,
} from './froid'
import { produitsARecommander, grouperParFournisseur, commanderEnTexte, ligneReappro } from './reappro'
import type { ReleveTemperature, Produit, Fournisseur } from './types'

const MAINTENANT = '2026-06-15T12:00:00Z'
const ilYa = (heures: number) => new Date(Date.parse(MAINTENANT) - heures * 3_600_000).toISOString()

const releve = (valeur: number, heures: number): ReleveTemperature => ({
  id: `r${heures}${valeur}`, zoneId: 'z-froi', valeur, date: ilYa(heures),
})

describe('la plage de temperature', () => {
  it('vaut 2 a 8 degres, comme dans les bonnes pratiques', () => {
    expect(PLAGE_MIN).toBe(2)
    expect(PLAGE_MAX).toBe(8)
  })

  it('les bornes sont conformes', () => {
    expect(dansLaPlage(2)).toBe(true)
    expect(dansLaPlage(8)).toBe(true)
    expect(dansLaPlage(1.9)).toBe(false)
    expect(dansLaPlage(8.1)).toBe(false)
  })

  it('une valeur aberrante est hors plage, pas « conforme »', () => {
    /* Le piege : NaN passe tous les tests « valeur < 8 ». */
    expect(dansLaPlage(Number.NaN)).toBe(false)
    expect(dansLaPlage(Number.POSITIVE_INFINITY)).toBe(false)
    expect(horsPlage(Number.NaN)).toBe(false)
  })
})

describe('la serie hors plage', () => {
  it('ne compte que les releves consecutifs', () => {
    /* Normal il y a 48 h, puis froid depuis 12 h : la serie
       contient les 3 releves froids et s'arrete a la normale. */
    const releves = [releve(5, 48), releve(11, 12), releve(12, 6), releve(10, 1)]
    expect(serieHorsPlage(releves).length).toBe(3)
  })

  it('une serie deja redeveloppe ne compte plus', () => {
    /* Le dernier releve est normal : le frigo est revenu dans
       la plage, il n'y a plus de coup de froid en cours. */
    const releves = [releve(11, 48), releve(12, 24), releve(11, 12), releve(5, 2)]
    expect(serieHorsPlage(releves)).toHaveLength(0)
    expect(dureeHorsPlage(releves, MAINTENANT)).toBe(0)
  })

  it('un releve normal remet le compteur a zero', () => {
    const releves = [releve(11, 72), releve(5, 2)]
    expect(dureeHorsPlage(releves, MAINTENANT)).toBe(0)
  })

  it('mesure la duree depuis le plus ancien de la serie', () => {
    const releves = [releve(11, 10), releve(12, 5), releve(10, 1)]
    expect(dureeHorsPlage(releves, MAINTENANT)).toBe(10)
  })

  it('toute la serie est hors plage depuis 60 h', () => {
    const releves = [releve(11, 60), releve(12, 30), releve(9, 2)]
    expect(dureeHorsPlage(releves, MAINTENANT)).toBe(60)
  })
})

describe('la quarantaine du froid', () => {
  it('ne se declenche pas avant 48 h', () => {
    const releves = [releve(11, 47), releve(12, 1)]
    expect(quarantaineRequise(releves, MAINTENANT)).toBe(false)
  })

  it('se declenche a 48 h pile', () => {
    const releves = [releve(11, 48), releve(12, 1)]
    expect(quarantaineRequise(releves, MAINTENANT)).toBe(true)
  })

  it('ne se declenche pas pour un ecart de quelques minutes', () => {
    const releves = [releve(11, 1), releve(12, 0.1)]
    expect(quarantaineRequise(releves, MAINTENANT)).toBe(false)
    expect(etatFroid(releves, 'z-froi', MAINTENANT).alertes).toHaveLength(1)
  })
})

describe("l'etat du froid", () => {
  it('conforme quand tout va bien', () => {
    const e = etatFroid([releve(4, 2)], 'z-froi', MAINTENANT)
    expect(e.dansLaPlage).toBe(true)
    expect(e.quarantaineRequise).toBe(false)
    expect(e.alertes).toHaveLength(0)
  })

  it('alerte « surveiller » tant que les 48 h ne sont pas passees', () => {
    const e = etatFroid([releve(11, 10)], 'z-froi', MAINTENANT)
    expect(e.alertes[0].niveau).toBe('surveiller')
    expect(e.alertes[0].detail).toContain('hors de la plage')
  })

  it('alerte « agir » et signale chaque produit apres 48 h', () => {
    const e = etatFroid([releve(11, 60)], 'z-froi', MAINTENANT, [
      { produitId: 'p1', libelle: 'Sirop X', quantite: 8 },
      { produitId: 'p2', libelle: 'Vaccin Y', quantite: 3 },
    ])
    expect(e.quarantaineRequise).toBe(true)
    expect(e.alertes.filter((a) => a.niveau === 'agir')).toHaveLength(3)
    expect(e.alertes.some((a) => a.libelle === 'Sirop X' && a.quantite === 8)).toBe(true)
  })

  it('aucun releve n\'est un etat conforme', () => {
    const e = etatFroid([], 'z-froi', MAINTENANT)
    expect(e.valeur).toBeUndefined()
    expect(e.alertes).toHaveLength(0)
    expect(decrireEtat(e)).toBe('Aucun relevé')
  })

  it('se decrit en jours et heures quand c\'est long', () => {
    const e = etatFroid([releve(11, 60)], 'z-froi', MAINTENANT)
    expect(decrireEtat(e)).toContain('2 j 12 h')
  })
})

/* ============================================================
   LE REAPPROVISIONNEMENT
   ============================================================ */

const P = (id: string, nom: string, seuil: number, fournisseurId?: string): Produit => ({
  id, rayonId: 'r1', categorieId: 'c1', nomFr: nom, unite: 'boite', seuil, actif: true, fournisseurId,
})

const FOURNISSEURS: Fournisseur[] = [
  { id: 'f1', rayonId: 'r1', nom: 'CENA' },
  { id: 'f2', rayonId: 'r1', nom: 'SIPROL' },
]

describe('une ligne de commande', () => {
  it('commande la difference entre le seuil et le stock', () => {
    expect(ligneReappro(P('p1', 'X', 20), 14).aCommander).toBe(6)
  })

  it('ne commande rien si le stock est deja au-dessus', () => {
    expect(ligneReappro(P('p1', 'X', 20), 35).aCommander).toBe(0)
  })

  it('signale la rupture', () => {
    expect(ligneReappro(P('p1', 'X', 20), 0).rupture).toBe(true)
    expect(ligneReappro(P('p1', 'X', 20), 3).rupture).toBe(false)
  })
})

describe('la liste a recommander', () => {
  const produits = [P('p1', 'Alpha', 20, 'f1'), P('p2', 'Beta', 10, 'f2'), P('p3', 'Gamma', 5, 'f1')]
  const stocks = new Map([['p1', 14], ['p2', 0], ['p3', 9]])

  it('ne garde que ce qui est sous le seuil', () => {
    const lignes = produitsARecommander(produits, stocks)
    expect(lignes.map((l) => l.nom).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('met les ruptures en premier', () => {
    expect(produitsARecommander(produits, stocks)[0].nom).toBe('Beta')
  })

  it('ignore les produits desactives', () => {
    const produits = [P('p1', 'Alpha', 20), { ...P('p2', 'Beta', 10), actif: false }]
    expect(produitsARecommander(produits, new Map([['p1', 1]])).map((l) => l.nom)).toEqual(['Alpha'])
  })

  it('groupe par fournisseur, les inconnus a la fin', () => {
    const produits = [
      P('p1', 'Alpha', 20, 'f1'), P('p2', 'Beta', 10, 'f2'),
      P('p3', 'Gamma', 5), P('p4', 'Delta', 5, 'f1'),
    ]
    const stocks = new Map([['p1', 1], ['p2', 1], ['p3', 1], ['p4', 1]])
    const commandes = grouperParFournisseur(produitsARecommander(produits, stocks), FOURNISSEURS)

    expect(commandes.map((c) => c.fournisseur)).toEqual(['CENA', 'SIPROL', 'Fournisseur non précisé'])
    expect(commandes[0].lignes.map((l) => l.nom).sort()).toEqual(['Alpha', 'Delta'])
    expect(commandes[0].total).toBe(19 + 4)
  })

  it('produit un texte copiable', () => {
    const commandes = grouperParFournisseur(
      produitsARecommander([P('p1', 'Alpha', 20, 'f1')], new Map([['p1', 14]])),
      FOURNISSEURS,
    )
    const texte = commanderEnTexte(commandes[0])
    expect(texte).toContain('CENA')
    expect(texte).toContain('Alpha')
    expect(texte).toContain('6 boite')
  })
})