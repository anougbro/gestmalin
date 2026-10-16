import { describe, expect, it } from 'vitest'
import {
  quantiteProduit,
  quantiteLot,
  quantiteParEmplacement,
  lotsParPriorite,
  rotationEstFEFO,
  dateReceptionDuLot,
} from './stock'
import type { Lot, Mouvement, TypeMouvement } from './types'

/* ============================================================
   OUTIL DE TEST — petit generateur aleatoire reproductible

   On utilise une graine fixe : si un test echoue, il echoue
   toujours de la meme facon, donc on peut reproduire le cas.
   ============================================================ */

function creerAlea(graine: number) {
  let etat = graine >>> 0
  return () => {
    etat = (etat * 1_664_525 + 1_013_904_223) >>> 0
    return etat / 4_294_967_296
  }
}

const EMPLACEMENTS = ['A2-04', 'A2-05', 'B1-02', 'B1-03', 'F1-02'] as const
const TYPES: TypeMouvement[] = ['reception', 'sortie', 'perte', 'transfert']

function creerMouvements(nb: number, graine: number, produitId: string): Mouvement[] {
  const alea = creerAlea(graine)
  const choisir = <T,>(liste: readonly T[]): T => liste[Math.floor(alea() * liste.length)]

  return Array.from({ length: nb }, (_, i) => {
    const type = choisir(TYPES)
    const quantite = 1 + Math.floor(alea() * 20)
    const depuis = choisir(EMPLACEMENTS)
    let vers = choisir(EMPLACEMENTS)
    if (vers === depuis) vers = EMPLACEMENTS[(EMPLACEMENTS.indexOf(depuis) + 1) % EMPLACEMENTS.length]

    return {
      id: `m${i}`,
      type,
      rayonId: 'r1',
      produitId,
      lotId: `l${Math.floor(alea() * 3)}`,
      quantite,
      ...(type === 'reception' ? { versEmplacementId: vers } : {}),
      ...(type === 'transfert' ? { depuisEmplacementId: depuis, versEmplacementId: vers } : {}),
      ...(type === 'sortie' || type === 'perte' ? { depuisEmplacementId: depuis, motif: 'delivrance' } : {}),
      auteurId: 'u1',
      date: `2026-01-${String(1 + Math.floor(alea() * 28)).padStart(2, '0')}T10:00:00Z`,
    }
  })
}

/* ============================================================
   1. LE TEST D'INVARIANT — LE TEST QUI COMMANDE

   Somme des quantites par emplacement = quantite totale.
   Ces deux valeurs sortent de deux fonctions differentes.
   Si l'une des deux a un bug, l'invariant casse.

   C'est le test que le plan nomme comme porte de sortie de
   la phase 1. Tant qu'il est rouge, aucune interface ne doit
   etre ecrite.
   ============================================================ */

describe('invariant : le total est toujours la somme des emplacements', () => {
  it('tient sur 1 000 suites de 60 mouvements chacune', () => {
    let verifiees = 0

    for (let graine = 1; graine <= 1_000; graine++) {
      const mouvements = creerMouvements(60, graine, 'p1')
      const total = quantiteProduit('p1', mouvements)

      let sommeDesEmplacements = 0
      for (const quantite of quantiteParEmplacement('p1', mouvements).values()) {
        sommeDesEmplacements += quantite
      }

      expect({ graine, total, sommeDesEmplacements }).toEqual({
        graine,
        total: sommeDesEmplacements,
        sommeDesEmplacements,
      })
      verifiees++
    }

    expect(verifiees).toBe(1_000)
  })

  it('un produit sans mouvement vaut exactement zero', () => {
    expect(quantiteProduit('inexistant', [])).toBe(0)
  })

  it('un produit non demande ne pollue pas le calcul', () => {
    const mouvements = creerMouvements(80, 42, 'autre-produit')
    expect(quantiteProduit('p1', mouvements)).toBe(0)
  })
})

/* ============================================================
   2. SCENARIOS DE PHARMACIE — chiffres calcules a la main
   ============================================================ */

describe('la regle d\'or, sur des cas reels', () => {
  const base: Mouvement[] = [
    { id: 'm1', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 20, versEmplacementId: 'A2-04', auteurId: 'u1', date: '2026-03-12T09:00:00Z' },
    { id: 'm2', type: 'sortie', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 8, depuisEmplacementId: 'A2-04', motif: 'delivrance', auteurId: 'u1', date: '2026-03-14T16:00:00Z' },
    { id: 'm3', type: 'transfert', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 5, depuisEmplacementId: 'A2-04', versEmplacementId: 'B1-02', auteurId: 'u1', date: '2026-03-15T10:00:00Z' },
    { id: 'm4', type: 'perte', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 2, depuisEmplacementId: 'B1-02', motif: 'casse', auteurId: 'u1', date: '2026-03-16T11:00:00Z' },
  ]

  it('reception 20, sortie 8, transfert 5, perte 2 => 10 restant', () => {
    expect(quantiteProduit('p1', base)).toBe(10)
  })

  it('un transfert ne change pas le total', () => {
    const avecTransfert = quantiteProduit('p1', base)
    const sansTransfert = quantiteProduit('p1', base.filter((m) => m.type !== 'transfert'))
    expect(avecTransfert).toBe(sansTransfert)
  })

  it('un transfert deplace la quantite sans la creer ni la detruire', () => {
    const parEmplacement = quantiteParEmplacement('p1', base)
    expect(parEmplacement.get('A2-04')).toBe(7)  // 20 - 8 - 5
    expect(parEmplacement.get('B1-02')).toBe(3)  // 5 - 2
  })

  it('on peut ajouter une sortie qui rend le stock negatif', () => {
    const excess: Mouvement[] = [...base, {
      id: 'm5', type: 'sortie', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 30,
      depuisEmplacementId: 'B1-02', motif: 'delivrance', auteurId: 'u1', date: '2026-03-20T09:00:00Z',
    }]
    /* Le stock fantome est AUTORISE mais exact : 10 - 30 = -20.
       On ne bloque pas le travail, on affiche l'ecart. */
    expect(quantiteProduit('p1', excess)).toBe(-20)
  })

  it('une correction se modelise par un mouvement ordinaire de sens inverse', () => {
    /* Erreur : on a sorti 8, c\'en etait 5. On re-entre 3.
       Le mouvement d'origine n\'est pas touche, il reste visible. */
    const corrige: Mouvement[] = [...base, {
      id: 'm6', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 3,
      versEmplacementId: 'A2-04', corrigeMouvementId: 'm2', motif: 'erreur de saisie',
      auteurId: 'u1', date: '2026-03-17T09:00:00Z',
    }]
    /* 10 + 3 = 13, et le mouvement fautif m2 est toujours la. */
    expect(quantiteProduit('p1', corrige)).toBe(13)
    expect(corrige.find((m) => m.id === 'm2')?.quantite).toBe(8)
  })

  it('la quantite par lot se calcule sur ce lot uniquement', () => {
    const mouvements: Mouvement[] = [
      { id: 'a1', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 20, versEmplacementId: 'A2-04', auteurId: 'u1', date: '2026-03-12T09:00:00Z' },
      { id: 'a2', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l2', quantite: 50, versEmplacementId: 'A2-04', auteurId: 'u1', date: '2026-03-13T09:00:00Z' },
      { id: 'a3', type: 'sortie', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 12, depuisEmplacementId: 'A2-04', motif: 'delivrance', auteurId: 'u1', date: '2026-03-14T09:00:00Z' },
    ]
    expect(quantiteLot('l1', mouvements)).toBe(8)
    expect(quantiteLot('l2', mouvements)).toBe(50)
    expect(quantiteProduit('p1', mouvements)).toBe(58)
  })
})

/* ============================================================
   3. LA ROTATION — FEFO et FIFO
   ============================================================ */

describe('quel lot sort en premier', () => {
  const lot = (id: string, peremption?: string): Lot => ({
    id, produitId: 'p1', peremption, quantite: 10, emplacementId: 'A2-04',
  })

  const reception = (lotId: string, date: string): Mouvement => ({
    id: `r-${lotId}`, type: 'reception', rayonId: 'r1', produitId: 'p1', lotId,
    quantite: 10, versEmplacementId: 'A2-04', auteurId: 'u1', date,
  })

  it('FEFO : le lot ancien mais proche de la peremption passe avant le lot recent', () => {
    /* Le piege du projet. Lot A recu il y a 2 ans mais qui perime
       dans 8 semaines ; lot B recu hier mais qui perime dans 2 ans. */
    const lots = [lot('B', '2028-03-31'), lot('A', '2026-08-01')]
    const mouvements = [reception('B', '2026-10-15T09:00:00Z'), reception('A', '2025-03-01T09:00:00Z')]

    expect(rotationEstFEFO('p1', lots)).toBe(true)
    expect(lotsParPriorite('p1', lots, mouvements).map((l) => l.id)).toEqual(['A', 'B'])
  })

  it('FEFO : le tri se fait bien sur la peremption, pas sur l\'arrivee', () => {
    const lots = [lot('x', '2027-01-01'), lot('y', '2026-06-01'), lot('z', '2026-12-01')]
    const mouvements = [reception('z', '2020-01-01T09:00:00Z'), reception('y', '2030-01-01T09:00:00Z'), reception('x', '2025-01-01T09:00:00Z')]
    expect(lotsParPriorite('p1', lots, mouvements).map((l) => l.id)).toEqual(['y', 'z', 'x'])
  })

  it('FEFO : un lot sans date passe en dernier, il n\'est pas le plus urgent', () => {
    const lots = [lot('sans-date'), lot('bientot', '2026-07-01'), lot('tard', '2029-01-01')]
    const mouvements = [reception('bientot', '2026-01-01T09:00:00Z'), reception('tard', '2026-01-01T09:00:00Z'), reception('sans-date', '2026-01-01T09:00:00Z')]
    expect(lotsParPriorite('p1', lots, mouvements).map((l) => l.id)).toEqual(['bientot', 'tard', 'sans-date'])
  })

  it('FIFO : sans date de peremption, le plus ancien recu sort en premier', () => {
    const lots = [lot('recent'), lot('ancien')]
    const mouvements = [reception('ancien', '2026-01-10T09:00:00Z'), reception('recent', '2026-09-01T09:00:00Z')]

    expect(rotationEstFEFO('p1', lots)).toBe(false)
    expect(lotsParPriorite('p1', lots, mouvements).map((l) => l.id)).toEqual(['ancien', 'recent'])
  })

  it('la date de reception est deduite du premier mouvement, jamais stockee', () => {
    const mouvements: Mouvement[] = [
      { id: 'b', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 5, versEmplacementId: 'A2-04', auteurId: 'u1', date: '2026-05-01T09:00:00Z' },
      { id: 'a', type: 'reception', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 5, versEmplacementId: 'A2-04', auteurId: 'u1', date: '2026-03-01T09:00:00Z' },
      { id: 'c', type: 'sortie', rayonId: 'r1', produitId: 'p1', lotId: 'l1', quantite: 2, depuisEmplacementId: 'A2-04', motif: 'delivrance', auteurId: 'u1', date: '2026-06-01T09:00:00Z' },
    ]
    expect(dateReceptionDuLot('l1', mouvements)).toBe('2026-03-01T09:00:00Z')
  })

  it('un lot jamais recu n\'a pas de date de reception, ca ne plante pas', () => {
    expect(dateReceptionDuLot('fantome', [])).toBeUndefined()
  })

  it('lotsParPriorite ne modifie pas le tableau qu\'on lui donne', () => {
    const lots = [lot('b', '2028-01-01'), lot('a', '2026-01-01')]
    const avant = lots.map((l) => l.id)
    lotsParPriorite('p1', lots, [reception('a', '2026-01-01T09:00:00Z'), reception('b', '2026-01-01T09:00:00Z')])
    expect(lots.map((l) => l.id)).toEqual(avant)
  })
})