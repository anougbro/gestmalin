import { describe, expect, it } from 'vitest'
import { verifierMouvement, estValide, exigerMouvementValide } from './verification'
import type { Mouvement, TypeMouvement } from './types'

const base: Mouvement = {
  id: 'm1',
  type: 'reception',
  rayonId: 'r1',
  produitId: 'p1',
  lotId: 'l1',
  quantite: 20,
  versEmplacementId: 'A2-04',
  auteurId: 'u1',
  date: '2026-03-12T09:00:00Z',
}

const avec = (modifs: Partial<Mouvement>): Mouvement => ({ ...base, ...modifs })

describe('verifierMouvement', () => {
  it('accepte une reception complete', () => {
    expect(verifierMouvement(base)).toEqual([])
    expect(estValide(base)).toBe(true)
  })

  it('refuse une reception sans emplacement d\'arrivee', () => {
    const p = verifierMouvement(avec({ versEmplacementId: undefined }))
    expect(p.map((x) => x.champ)).toContain('versEmplacementId')
  })

  it('refuse une reception qui part aussi d\'un endroit', () => {
    const p = verifierMouvement(avec({ depuisEmplacementId: 'B1-02' }))
    expect(p.map((x) => x.champ)).toContain('depuisEmplacementId')
  })

  it('refuse une sortie sans motif', () => {
    const p = verifierMouvement(avec({ type: 'sortie', versEmplacementId: undefined, depuisEmplacementId: 'A2-04' }))
    expect(p.map((x) => x.champ)).toContain('motif')
  })

  it('refuse une sortie qui arrive quelque part', () => {
    const p = verifierMouvement(avec({ type: 'sortie', depuisEmplacementId: 'A2-04', versEmplacementId: 'B1-02', motif: 'delivrance' }))
    expect(p.map((x) => x.champ)).toContain('versEmplacementId')
  })

  it('refuse un transfert sans arrivee', () => {
    const p = verifierMouvement(avec({ type: 'transfert', depuisEmplacementId: 'A2-04', versEmplacementId: undefined }))
    expect(p.map((x) => x.champ)).toContain('versEmplacementId')
  })

  it('refuse un transfert qui va au meme endroit', () => {
    const p = verifierMouvement(avec({ type: 'transfert', depuisEmplacementId: 'A2-04', versEmplacementId: 'A2-04' }))
    expect(p.map((x) => x.champ)).toContain('versEmplacementId')
  })

  describe('la quantite', () => {
    const cas: [number | string, boolean][] = [
      [0, false],
      [-5, false],
      [2.5, false],
      [1, true],
      [9999, true],
    ]

    it.each(cas)('quantite %s => %s', (quantite, doitPasser) => {
      const m = avec({ quantite: quantite as number })
      expect(estValide(m)).toBe(doitPasser)
    })

    it('rappelle que le sens vient du type, pas du signe', () => {
      const m = verifierMouvement(avec({ quantite: -3, versEmplacementId: undefined, depuisEmplacementId: 'A2-04', motif: 'delivrance' }))
      expect(m.find((p) => p.champ === 'quantite')?.message).toContain('sens vient du type')
    })
  })

  describe('la date', () => {
    it.each(['2026-03-12', '12/03/2026', 'hier', '2026-03-12 09:00'])('refuse « %s »', (date) => {
      const p = verifierMouvement(avec({ date }))
      expect(p.map((x) => x.champ)).toContain('date')
    })

    it('accepte le format ISO avec et sans millisecondes', () => {
      expect(estValide(avec({ date: '2026-03-12T09:00:00Z' }))).toBe(true)
      expect(estValide(avec({ date: '2026-03-12T09:00:00.123Z' }))).toBe(true)
      expect(estValide(avec({ date: '2026-03-12T09:00:00+01:00' }))).toBe(true)
    })
  })

  it('refuse un mouvement sans auteur', () => {
    expect(verifierMouvement(avec({ auteurId: '' })).map((x) => x.champ)).toContain('auteurId')
  })

  it('refuse un mouvement qui se corrige lui-meme', () => {
    const p = verifierMouvement(avec({ corrigeMouvementId: 'm1' }))
    expect(p.map((x) => x.champ)).toContain('corrigeMouvementId')
  })

  it('accepte un mouvement qui en corrige un autre', () => {
    expect(estValide(avec({ corrigeMouvementId: 'm0' }))).toBe(true)
  })

  it('signale tous les problemes d\'un coup, pas un par un', () => {
    const p = verifierMouvement({
      id: '', rayonId: '', produitId: '', auteurId: '',
      type: 'transfert', quantite: -1, date: 'pas une date',
    })
    expect(p.length).toBeGreaterThanOrEqual(6)
  })
})

describe('exigerMouvementValide', () => {
  it('renvoie le mouvement si tout va bien', () => {
    expect(exigerMouvementValide(base)).toBe(base)
  })

  it('leve une erreur explicite sinon', () => {
    expect(() => exigerMouvementValide(avec({ quantite: 0 }))).toThrow(/quantite/)
  })
})

describe('les quatre types, en un coup d\'oeil', () => {
  const cas: [TypeMouvement, Partial<Mouvement>, boolean][] = [
    ['reception', { versEmplacementId: 'A2-04' }, true],
    ['reception', { versEmplacementId: undefined }, false],
    ['sortie', { versEmplacementId: undefined, depuisEmplacementId: 'A2-04', motif: 'delivrance' }, true],
    ['sortie', { versEmplacementId: undefined, depuisEmplacementId: 'A2-04', motif: undefined }, false],
    ['perte', { versEmplacementId: undefined, depuisEmplacementId: 'A2-04', motif: 'casse' }, true],
    ['transfert', { depuisEmplacementId: 'A2-04', versEmplacementId: 'B1-02' }, true],
    ['transfert', { depuisEmplacementId: 'A2-04', versEmplacementId: undefined }, false],
  ]

  it.each(cas)('%s avec %j => %s', (type, modifs, attendu) => {
    expect(estValide(avec({ type, ...modifs }))).toBe(attendu)
  })
})