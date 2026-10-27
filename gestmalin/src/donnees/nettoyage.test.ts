import { afterEach, describe, expect, it } from 'vitest'
import { base } from './base'
import { toutEffacer } from './depots'
import { effacerDonneesEssai } from './nettoyage'
import { empreinte, LONGUEUR_CODE, type Utilisateur } from '../domaine/acces'

/* ============================================================
   LE NETTOYAGE DU JEU D'ESSAI

   On efface par identifiant exact, jamais par nom. Un vrai
   produit qui s'appelle « Paracétamol » doit rester.
   ============================================================ */

function compte(id: string, role: Utilisateur['role'], nom: string): Utilisateur {
  return {
    id,
    nom,
    role,
    rayonsAutorises: ['r-med'],
    actif: true,
    independant: true,
    telephone: '9000000001',
    longueurCode: LONGUEUR_CODE,
    empreinte: empreinte(id, '12345'),
  }
}

afterEach(async () => {
  await toutEffacer()
})

describe('effacer les donnees d essai', () => {
  it('efface les faux comptes et les faux produits, pas les vrais', async () => {
    await base.utilisateurs.bulkPut([
      compte('u-1', 'preparateur', 'Préparateur'),
      compte('u-reel', 'directeur', 'Vraie directrice'),
    ])
    await base.produits.bulkPut([
      {
        id: 'para1', rayonId: 'r-med', categorieId: 'c-1', nomFr: 'Paracétamol',
        unite: 'boite', seuil: 5, actif: true,
      },
      {
        id: 'p-reel', rayonId: 'r-med', categorieId: 'c-1', nomFr: 'Paracétamol',
        unite: 'boite', seuil: 5, actif: true,
      },
    ])
    await base.lots.bulkPut([
      { id: 'para1-lot1', produitId: 'para1', numero: 'A1', quantite: 0, emplacementId: 'e-1' },
      { id: 'p-reel-lot1', produitId: 'p-reel', numero: 'B1', quantite: 0, emplacementId: 'e-1' },
    ])
    await base.mouvements.bulkPut([
      {
        id: 'm-faux', type: 'reception', rayonId: 'r-med', produitId: 'para1',
        lotId: 'para1-lot1', quantite: 5, versEmplacementId: 'e-1',
        auteurId: 'u-1', date: '2026-01-01T09:00:00Z', synchro: 0,
      },
      {
        id: 'm-reel', type: 'reception', rayonId: 'r-med', produitId: 'p-reel',
        lotId: 'p-reel-lot1', quantite: 7, versEmplacementId: 'e-1',
        auteurId: 'u-reel', date: '2026-01-02T09:00:00Z', synchro: 0,
      },
    ])
    await base.demandesApprobation.put({
      id: 'dem-1', type: 'quarantaine', rayonId: 'r-med', statut: 'en_attente',
      motif: 'faux', demandeurId: 'u-1', date: '2026-01-01T09:00:00Z',
    })

    await effacerDonneesEssai()

    expect(await base.utilisateurs.get('u-1')).toBeUndefined()
    expect(await base.utilisateurs.get('u-reel')).toBeDefined()
    expect(await base.produits.get('para1')).toBeUndefined()
    expect(await base.produits.get('p-reel')).toBeDefined()
    expect(await base.lots.get('para1-lot1')).toBeUndefined()
    expect(await base.lots.get('p-reel-lot1')).toBeDefined()
    expect(await base.mouvements.get('m-faux')).toBeUndefined()
    expect(await base.mouvements.get('m-reel')).toBeDefined()
    expect(await base.demandesApprobation.get('dem-1')).toBeUndefined()
  })

  it('rend la direction au premier compte reel s il n y a plus de directeur', async () => {
    await base.utilisateurs.bulkPut([
      compte('u-1', 'directeur', 'Faux directeur'),
      compte('u-reel', 'preparateur', 'Vraie personne'),
    ])

    await effacerDonneesEssai()

    const reste = await base.utilisateurs.get('u-reel')
    expect(reste?.role).toBe('directeur')
    expect(reste?.actif).toBe(true)
  })

  it('ne fait rien quand la base est vide', async () => {
    await expect(effacerDonneesEssai()).resolves.toBeUndefined()
    expect(await base.utilisateurs.count()).toBe(0)
  })
})
