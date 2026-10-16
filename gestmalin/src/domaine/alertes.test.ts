import { describe, expect, it } from 'vitest'
import { calculerAlertes, compterAlertes, FENETRE_PEREMPTION } from './alertes'
import { aujourdhui, joursAvant, reinitialiserTemps } from './temps'
import type { Lot, Mouvement, Produit } from './types'

const P1: Produit = { id: 'p1', rayonId: 'r1', categorieId: 'c1', nomFr: 'Paracétamol', unite: 'boite', seuil: 10, actif: true }
const P2: Produit = { id: 'p2', rayonId: 'r1', categorieId: 'c1', nomFr: 'Ibuprofène', unite: 'boite', seuil: 5, actif: true }

const L = (id: string, produitId: string, peremption?: string, emplacementId = 'A2-04'): Lot =>
  ({ id, produitId, peremption, quantite: 0, emplacementId })

/* reference fixe : les tests ne doivent pas dependre du jour ou
   on les lance. */
const AUJOURDHUI = '2026-06-15'
const dateISO = (d: string) => `${d}T08:00:00Z`

const entree = (lotId: string, produitId: string, q: number): Mouvement => ({
  id: `m-${lotId}`, type: 'reception', rayonId: 'r1', produitId, lotId,
  quantite: q, versEmplacementId: 'A2-04', auteurId: 'u1', date: dateISO('2026-01-01'),
})

const sortie = (lotId: string, produitId: string, q: number): Mouvement => ({
  id: `s-${lotId}`, type: 'sortie', rayonId: 'r1', produitId, lotId,
  quantite: q, depuisEmplacementId: 'A2-04', motif: 'delivrance', auteurId: 'u1', date: dateISO('2026-02-01'),
})

describe('le temps ne recule jamais', () => {
  it('joursAvant compte en jours entiers', () => {
    expect(joursAvant('2026-06-15', AUJOURDHUI)).toBe(0)
    expect(joursAvant('2026-06-25', AUJOURDHUI)).toBe(10)
    expect(joursAvant('2026-06-05', AUJOURDHUI)).toBe(-10)
  })

  it('une date illisible ne plante pas', () => {
    expect(joursAvant('nimportequoi', AUJOURDHUI)).toBe(0)
  })

  it('aujourdhui rend une date courte', () => {
    expect(aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('les alertes de peremption', () => {
  it('un lot perime declenche « agir »', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', '2026-06-01')],
      mouvements: [entree('l1', 'p1', 20)], reference: AUJOURDHUI,
    })
    const perime = a.find((x) => x.nature === 'perime')
    expect(perime?.niveau).toBe('agir')
    expect(perime?.detail).toContain('14 jours')
  })

  it('un lot qui perime bientot declenche « surveiller »', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', '2026-08-01')],
      mouvements: [entree('l1', 'p1', 20)], reference: AUJOURDHUI,
    })
    expect(a.find((x) => x.nature === 'peremption_proche')?.niveau).toBe('surveiller')
  })

  it('le seuil de la fenetre est respecte', () => {
    const limite = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', '2026-09-13')],   /* 90 jours pile */
      mouvements: [entree('l1', 'p1', 5)], reference: AUJOURDHUI,
    })
    const apres = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', '2026-09-14')],   /* 91 jours */
      mouvements: [entree('l1', 'p1', 5)], reference: AUJOURDHUI,
    })
    expect(limite.some((x) => x.nature === 'peremption_proche')).toBe(true)
    expect(apres.some((x) => x.nature === 'peremption_proche')).toBe(false)
  })

  it('un lot PERIME mais VIDE ne declenche rien', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', '2020-01-01')],
      mouvements: [entree('l1', 'p1', 10), sortie('l1', 'p1', 10)], reference: AUJOURDHUI,
    })
    expect(a.filter((x) => x.nature === 'perime')).toHaveLength(0)
  })

  it('un lot sans date ne declenche jamais d alerte de peremption', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1')],
      mouvements: [entree('l1', 'p1', 20)], reference: AUJOURDHUI,
    })
    expect(a.filter((x) => x.nature === 'perime' || x.nature === 'peremption_proche')).toHaveLength(0)
  })
})

describe('les alertes de seuil', () => {
  it("sous le seuil, c'est « agir »", () => {
    const a = calculerAlertes({
      produits: [P1], lots: [], mouvements: [entree('l1', 'p1', 8)], reference: AUJOURDHUI,
    })
    const seuil = a.find((x) => x.nature === 'sous_seuil')
    expect(seuil?.niveau).toBe('agir')
    expect(seuil?.detail).toContain('8')
  })

  it('la rupture est signalee comme rupture', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [], mouvements: [entree('l1', 'p1', 8), sortie('l1', 'p1', 8)], reference: AUJOURDHUI,
    })
    expect(a.find((x) => x.nature === 'sous_seuil')?.detail).toBe('Rupture')
  })

  it('au-dessus du seuil, rien', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [], mouvements: [entree('l1', 'p1', 11)], reference: AUJOURDHUI,
    })
    expect(a.filter((x) => x.nature === 'sous_seuil')).toHaveLength(0)
  })
})

describe('la quarantaine', () => {
  it('un lot range en quarantaine declenche « surveiller »', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', undefined, 'Z-01')],
      mouvements: [entree('l1', 'p1', 20)], emplacementsQuarantaine: ['Z-01'], reference: AUJOURDHUI,
    })
    expect(a.find((x) => x.nature === 'quarantaine')?.niveau).toBe('surveiller')
  })

  it('la quarantaine concerne TOUJOURS le rayon, jamais une autre zone', () => {
    const a = calculerAlertes({
      produits: [P1], lots: [L('l1', 'p1', undefined, 'A2-04')],
      mouvements: [entree('l1', 'p1', 20)], emplacementsQuarantaine: ['Z-01'], reference: AUJOURDHUI,
    })
    expect(a.filter((x) => x.nature === 'quarantaine')).toHaveLength(0)
  })
})

describe('l\'ordre et les compteurs', () => {
  it('« agir » vient toujours avant « surveiller »', () => {
    const a = calculerAlertes({
      produits: [P1, P2],
      lots: [L('l1', 'p1', '2026-07-01'), L('l2', 'p2', undefined, 'Z-01')],
      mouvements: [entree('l1', 'p1', 5), entree('l2', 'p2', 2)],
      emplacementsQuarantaine: ['Z-01'], reference: AUJOURDHUI,
    })
    const premierSurveiller = a.findIndex((x) => x.niveau === 'surveiller')
    const dernierAgir = a.map((x) => x.niveau).lastIndexOf('agir')
    expect(premierSurveiller).toBeGreaterThan(dernierAgir)
  })

  it('les compteurs separent agir et surveiller', () => {
    const a = calculerAlertes({
      produits: [P1, P2],
      lots: [L('l1', 'p1', '2026-07-01'), L('l2', 'p2', undefined, 'Z-01')],
      mouvements: [entree('l1', 'p1', 5), entree('l2', 'p2', 2)],
      emplacementsQuarantaine: ['Z-01'], reference: AUJOURDHUI,
    })
    const c = compterAlertes(a)
    expect(c.agir + c.surveiller).toBe(c.total)
    expect(c.total).toBeGreaterThan(0)
  })

  it('aucune alerte ne disparait quand la date passe au bon moment', () => {
    /* Erreur classique : une alerte qui se "consomme" parce qu'on
       l'a vue. Ici on recalcule toujours depuis les memes donnees. */
    const params = {
      produits: [P1], lots: [L('l1', 'p1', '2026-06-01')],
      mouvements: [entree('l1', 'p1', 20)], reference: AUJOURDHUI,
    }
    const a1 = calculerAlertes(params)
    const a2 = calculerAlertes(params)
    expect(a2).toEqual(a1)
  })
})

describe('la fenetre de peremption', () => {
  it('vaut 90 jours, comme dans les bonnes pratiques de distribution', () => {
    expect(FENETRE_PEREMPTION).toBe(90)
  })
})

afterEach(() => reinitialiserTemps())