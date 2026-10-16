import { beforeEach, describe, expect, it } from 'vitest'
import { base } from './base'
import {
  enregistrerMouvement, nouvelId, maintenant, produits, lots,
  emplacements, zones, stockDe, stocksDuRayon, lotPrioritaire,
  lotsServisEnPremier, journal, rechercher, toutEffacer,
} from './depots'
import type { LotRow, ProduitRow } from './base'

/* ============================================================
   TESTS DE LA COUCHE DONNEES
   IndexedDB est simule en memoire (fake-indexeddb).
   Le code teste est exactement le code de production.
   ============================================================ */

const PRODUIT: ProduitRow = {
  id: 'p-para', rayonId: 'r-med', categorieId: 'c-med', nomFr: 'Paracétamol 500 mg',
  codeBarres: '3400930123456', unite: 'boite', seuil: 10, actif: true,
  dci: 'PARACETAMOL', forme: 'comprime',
}

const AUTRE: ProduitRow = {
  id: 'p-ibup', rayonId: 'r-med', categorieId: 'c-med', nomFr: 'Ibuprofène 400 mg',
  codeBarres: '3400930999999', unite: 'boite', seuil: 5, actif: true,
}

function lot(peremption?: string, id = nouvelId()): LotRow {
  return { id, produitId: 'p-para', numero: 'A2X9F', peremption, quantite: 0, emplacementId: 'e-a204' }
}

async function recevoir(produitId: string, quantite: number, lotId: string, date = maintenant()) {
  return enregistrerMouvement({
    id: nouvelId(), type: 'reception', rayonId: 'r-med', produitId, lotId,
    quantite, versEmplacementId: 'e-a204', auteurId: 'u1', date,
  })
}

async function sortir(produitId: string, quantite: number, lotId: string) {
  return enregistrerMouvement({
    id: nouvelId(), type: 'sortie', rayonId: 'r-med', produitId, lotId,
    quantite, depuisEmplacementId: 'e-a204', motif: 'delivrance',
    auteurId: 'u1', date: maintenant(),
  })
}

beforeEach(async () => {
  await toutEffacer()
  await base.rayons.bulkAdd([
    { id: 'r-med', nom: 'Médicaments', ordre: 1 },
    { id: 'r-men', nom: 'Ménagers', ordre: 2 },
  ])
  await base.zones.bulkAdd([
    { id: 'z-sec', rayonId: 'r-med', nom: 'Réserve sèche', type: 'reserve_seche' },
    { id: 'z-froi', rayonId: 'r-med', nom: 'Réserve froide', type: 'reserve_froide' },
    { id: 'z-men', rayonId: 'r-men', nom: 'Rayon ménage', type: 'reserve_seche' },
  ])
  await base.emplacements.bulkAdd([
    { id: 'e-a204', zoneId: 'z-sec', code: 'A2-04', ordre: 4 },
    { id: 'e-b102', zoneId: 'z-sec', code: 'B1-02', ordre: 2 },
  ])
  await base.produits.bulkAdd([PRODUIT, AUTRE])
})

describe('le journal refuse tout mouvement invalide', () => {
  it('refuse une sortie sans motif', async () => {
    await expect(
      enregistrerMouvement({
        id: 'x', type: 'sortie', rayonId: 'r-med', produitId: 'p-para',
        quantite: 3, depuisEmplacementId: 'e-a204', auteurId: 'u1', date: maintenant(),
      }),
    ).rejects.toThrow(/motif/)
  })

  it('n\'ecrit rien quand le mouvement est refuse', async () => {
    const avant = await base.mouvements.count()
    await enregistrerMouvement({
      id: 'x', type: 'sortie', rayonId: 'r-med', produitId: 'p-para',
      quantite: 3, depuisEmplacementId: 'e-a204', auteurId: 'u1', date: maintenant(),
    }).catch(() => undefined)
    expect(await base.mouvements.count()).toBe(avant)
  })

  it('marque tout nouveau mouvement comme non synchronise', async () => {
    const m = await recevoir('p-para', 10, 'l1')
    expect(m.synchro).toBe(0)
    expect((await journal.enAttenteDeSynchro()).length).toBe(1)
  })
})

describe('le stock est calcule, jamais stocke', () => {
  it('une reception puis une sortie', async () => {
    await lots.enregistrer(lot('2028-03-31', 'l1'))
    await recevoir('p-para', 20, 'l1')
    await sortir('p-para', 8, 'l1')
    expect(await stockDe('p-para')).toBe(12)
  })

  it('rien n\'est ecrit dans la table produits', async () => {
    await lots.enregistrer(lot('2028-03-31', 'l1'))
    await recevoir('p-para', 20, 'l1')

    /* Le produit ne contient aucun champ quantite.
       On le verifie en ecrivant le produit APRES les mouvements :
       le stock calcule ne doit pas bouger. */
    await produits.enregistrer({ ...PRODUIT, seuil: 999 })
    expect(await stockDe('p-para')).toBe(20)
  })

  it('un produit sans mouvement vaut zero', async () => {
    expect(await stockDe('p-inconnu')).toBe(0)
  })

  it('les stocks d\'un rayon ne se melangent pas', async () => {
    await lots.enregistrer(lot('2028-03-31', 'l1'))
    await recevoir('p-para', 20, 'l1')
    await recevoir('p-ibup', 7, 'l2')

    const stock = await stocksDuRayon('r-med')
    expect(stock.get('p-para')).toBe(20)
    expect(stock.get('p-ibup')).toBe(7)
  })
})

describe('le lot a servir en premier', () => {
  it('FEFO : le lot ancien mais proche de la peremption passe avant le lot recent', async () => {
    await lots.enregistrer(lot('2028-03-31', 'lot-recent'))
    await lots.enregistrer(lot('2026-08-01', 'lot-bientot'))

    /* Lot recu il y a 2 ans, mais qui perime dans 8 semaines. */
    await recevoir('p-para', 20, 'lot-bientot', '2025-03-01T09:00:00Z')
    await recevoir('p-para', 50, 'lot-recent', '2026-10-15T09:00:00Z')

    expect((await lotPrioritaire('p-para'))?.lot.id).toBe('lot-bientot')
  })

  it('ignore un lot dont il ne reste rien', async () => {
    await lots.enregistrer(lot('2026-08-01', 'lot-vide'))
    await lots.enregistrer(lot('2028-03-31', 'lot-plein'))

    await recevoir('p-para', 5, 'lot-vide')
    await sortir('p-para', 5, 'lot-vide')
    await recevoir('p-para', 30, 'lot-plein')

    expect((await lotPrioritaire('p-para'))?.lot.id).toBe('lot-plein')
  })

  it('renvoie les lots dans l\'ordre, avec leurs quantites', async () => {
    await lots.enregistrer(lot('2028-03-31', 'b'))
    await lots.enregistrer(lot('2026-06-01', 'a'))
    await recevoir('p-para', 40, 'b')
    await recevoir('p-para', 12, 'a')

    const servis = await lotsServisEnPremier('p-para')
    expect(servis.map((s) => s.lot.id)).toEqual(['a', 'b'])
    expect(servis.map((s) => s.quantite)).toEqual([12, 40])
  })

  it('renvoie rien si le produit n\'a aucun stock', async () => {
    expect(await lotPrioritaire('p-para')).toBeUndefined()
  })
})

describe('la recherche', () => {
  it('trouve par nom', async () => {
    const r = await rechercher('r-med', 'para')
    expect(r.map((p) => p.id)).toContain('p-para')
  })

  it('trouve par code-barres', async () => {
    const r = await rechercher('r-med', '3400930123456')
    expect(r[0]?.id).toBe('p-para')
  })

  it('ne franchit pas la frontiere du rayon', async () => {
    expect(await rechercher('r-men', 'para')).toEqual([])
  })

  it('ne renvoie rien sur une recherche vide', async () => {
    expect(await rechercher('r-med', '   ')).toEqual([])
  })
})

describe('les referentiels', () => {
  it('les produits actifs d\'un rayon seulement', async () => {
    await produits.enregistrer({ ...PRODUIT, actif: false })
    const actifs = await produits.duRayon('r-med')
    expect(actifs.map((p) => p.id)).toEqual(['p-ibup'])
  })

  it('retrouve un produit par son code-barres', async () => {
    expect((await produits.parCodeBarres('3400930999999'))?.id).toBe('p-ibup')
  })

  it('les zones froides sont isolees', async () => {
    const froides = await zones.froides()
    expect(froides.map((z) => z.id)).toEqual(['z-froi'])
  })

  it('un emplacement se retrouve par son code imprime', async () => {
    expect((await emplacements.parCode('A2-04'))?.id).toBe('e-a204')
  })
})