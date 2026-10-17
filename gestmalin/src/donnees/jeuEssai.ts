import { base, ATTENTE_ID } from './base'
import { nouvelId, maintenant } from './depots'
import type { LotRow, MouvementRow, ProduitRow } from './base'
import { empreinte, LONGUEUR_CODE } from '../domaine/acces'

/* ============================================================
   LE JEU D'ESSAI

   Une pharmacie ne se teste pas sur deux produits fictifs :
   on ne voit ni le FEFO, ni les alertes, ni les seuils.

   Ce jeu ressemble a une vraie officine : des produits medicamentaux
   et des produits menagers, des lots qui periment tot, d'autres
   dans deux ans, du stock a des niveaux varies, et quelques
   boites au quai qui attendent d'etre rangees.

   Apres l'essai, on efface tout : une application qui contient
   de faux medicaments est une application dangereuse.
   ============================================================ */

const jour = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

type Graine = {
  id: string; nom: string; cat: string; cb?: string; unite: string
  seuil: number; dci?: string; forme?: string; pays?: string
  peremption: number | null; quantite: number; lot: string
  emplacement?: string
}

const MEDICAMENTS: Graine[] = [
  { id: 'para1', nom: 'Paracétamol 500 mg comprimé', cat: 'c-med', cb: '3400930123456', unite: 'boite', seuil: 20, dci: 'PARACETAMOL', forme: 'Comprimé', pays: 'FR', peremption: 34, quantite: 18, lot: 'A2X9F', emplacement: 'z-sec-e1' },
  { id: 'para2', nom: 'Paracétamol 1 g comprimé', cat: 'c-med', cb: '3400930123457', unite: 'boite', seuil: 15, dci: 'PARACETAMOL', forme: 'Comprimé', pays: 'FR', peremption: 640, quantite: 45, lot: 'B7K2P', emplacement: 'z-sec-e1' },
  { id: 'amox1', nom: 'Amoxicilline 500 mg gélules', cat: 'c-med', cb: '3400930111111', unite: 'boite', seuil: 10, dci: 'AMOXICILLINE', forme: 'Gélule', pays: 'IN', peremption: -4, quantite: 12, lot: 'C1D3E', emplacement: 'z-sec-e2' },
  { id: 'ibup1', nom: 'Ibuprofène 400 mg comprimé', cat: 'c-med', cb: '3400930222222', unite: 'plaquette', seuil: 15, dci: 'IBUPROFENE', forme: 'Comprimé', pays: 'FR', peremption: 58, quantite: 9, lot: 'F4G5H', emplacement: 'z-sec-e3' },
  { id: 'doli1', nom: 'Doliprane 1000 mg', cat: 'c-med', cb: '3400930555555', unite: 'boite', seuil: 12, dci: 'PARACETAMOL', pays: 'FR', peremption: 310, quantite: 26, lot: 'N9P0Q', emplacement: 'z-sec-e3' },
  { id: 'vitc', nom: 'Vitamine C 1000 mg', cat: 'c-para', cb: '3400930777777', unite: 'plaquette', seuil: 10, dci: 'ACIDE ASCORBIQUE', pays: 'FR', peremption: 120, quantite: 4, lot: 'R1S2T', emplacement: 'z-vit-e1' },
  { id: 'sero', nom: 'Sérum physiologique 500 ml', cat: 'c-med', cb: '3400930333333', unite: 'boite', seuil: 8, peremption: 400, quantite: 15, lot: 'U3V4W', emplacement: 'z-sec-e4' },
  { id: 'siro', nom: 'Sirop antitussif 150 ml', cat: 'c-med', cb: '3400930666666', unite: 'boite', seuil: 8, peremption: 190, quantite: 7, lot: 'X5Y6Z', emplacement: 'z-froi-e1' },
  { id: 'vitd', nom: 'Vitamine D gouttes', cat: 'c-med', cb: '3400930888888', unite: 'boite', seuil: 5, dci: 'CHOLECALCIFEROL', pays: 'FR', peremption: 25, quantite: 3, lot: 'a7b8c', emplacement: 'z-froi-e2' },
  { id: 'sero', nom: 'Seringue 5 ml stérile', cat: 'c-mat', cb: '3400930444444', unite: 'piece', seuil: 50, peremption: null, quantite: 22, lot: 'd9e0f', emplacement: 'z-sec-e5' },
  { id: 'pans', nom: 'Pansement stérile 10 x 10', cat: 'c-mat', cb: '3400930999999', unite: 'piece', seuil: 30, peremption: null, quantite: 8, lot: 'g1h2i', emplacement: 'z-sec-e5' },
  { id: 'or', nom: 'Sachets de réhydratation orale', cat: 'c-med', cb: '3400930aaaaa', unite: 'piece', seuil: 40, pays: 'FR', peremption: 200, quantite: 96, lot: 'j3k4l', emplacement: 'z-sec-e6' },
]

const MENAGERS: Graine[] = [
  { id: 'the', nom: 'Thé vert en vrac 100 g', cat: 'c-men', unite: 'boite', seuil: 5, peremption: 500, quantite: 9, lot: 'm5n6o', emplacement: 'z-men-e1' },
  { id: 'savon', nom: 'Savon de ménage 400 g', cat: 'c-men', unite: 'piece', seuil: 30, peremption: null, quantite: 18, lot: 'p7q8r', emplacement: 'z-men-e1' },
  { id: 'lessive', nom: 'Lessive en poudre 1 kg', cat: 'c-men', unite: 'sachet', seuil: 20, peremption: 260, quantite: 6, lot: 's9t0u', emplacement: 'z-men-e2' },
  { id: 'seau', nom: 'Seau en plastique 20 L', cat: 'c-men', unite: 'piece', seuil: 6, peremption: null, quantite: 4, lot: 'v1w2x', emplacement: 'z-men-e2' },
  { id: 'serviette', nom: 'Serviettes de bain, lot de 6', cat: 'c-men', unite: 'piece', seuil: 8, peremption: null, quantite: 11, lot: 'y3z4a', emplacement: 'z-men-e3' },
  { id: 'eau', nom: 'Eau minérale 1,5 L', cat: 'c-div', cb: '3400930bbbbb', unite: 'piece', seuil: 60, peremption: 180, quantite: 42, lot: 'b5c6d', emplacement: 'z-men-e4' },
  { id: 'sucre', nom: 'Sucre en poudre 1 kg', cat: 'c-div', unite: 'sachet', seuil: 15, peremption: 300, quantite: 20, lot: 'e7f8g', emplacement: 'z-men-e4' },
]

/* Ce qui attend au quai : livre, pas encore pose. */
const AU_QUAI = [
  { id: 'quai1', nom: 'Métronidazole 500 mg', cb: '3400930ccccc', unite: 'boite', seuil: 10, dci: 'METRONIDAZOLE', pays: 'FR', peremption: 420, quantite: 14, lot: 'h1i2j', cat: 'c-med' },
  { id: 'quai2', nom: 'Gants d’examen, boîte de 100', unite: 'boite', seuil: 10, peremption: null, quantite: 8, lot: 'k3l4m', cat: 'c-mat' },
  { id: 'quai3', nom: 'Éponge grattante', unite: 'piece', seuil: 12, peremption: null, quantite: 24, lot: 'n5o6p', cat: 'c-men' },
]

export async function chargerJeuEssai(rayonMed: string, rayonMen: string, auteurId: string): Promise<{ produits: number; mouvements: number }> {
  const maintenantISO = maintenant()
  const produits: ProduitRow[] = []
  const lots: LotRow[] = []
  const mouvements: MouvementRow[] = []

  for (const [rayonId, graines] of [[rayonMed, MEDICAMENTS], [rayonMen, MENAGERS]] as const) {
    for (const g of graines) {
      produits.push({
        id: g.id, rayonId, categorieId: g.cat, nomFr: g.nom,
        codeBarres: g.cb, unite: g.unite as ProduitRow['unite'],
        seuil: g.seuil, emplacementId: g.emplacement, actif: true,
        dci: g.dci, forme: g.forme, paysOrigine: g.pays,
      })

      /* Deux lots quand la peremption est proche : c'est ce qui
         rend le FEFO visible a l'ecran. */
      const lotId = `${g.id}-lot1`
      lots.push({
        id: lotId, produitId: g.id, numero: g.lot,
        peremption: g.peremption === null ? undefined : jour(g.peremption),
        quantite: 0, emplacementId: g.emplacement ?? ATTENTE_ID,
      })
      mouvements.push({
        id: nouvelId(), type: 'reception', rayonId, produitId: g.id, lotId,
        quantite: g.quantite, versEmplacementId: g.emplacement ?? ATTENTE_ID,
        auteurId, date: maintenantISO, synchro: 0,
      })

      if (g.peremption !== null && g.peremption < 400) {
        const lot2 = `${g.id}-lot2`
        lots.push({
          id: lot2, produitId: g.id, numero: `${g.lot}b`,
          peremption: jour(g.peremption + 900), quantite: 0,
          emplacementId: g.emplacement ?? ATTENTE_ID,
        })
        mouvements.push({
          id: nouvelId(), type: 'reception', rayonId, produitId: g.id, lotId: lot2,
          quantite: g.quantite, versEmplacementId: g.emplacement ?? ATTENTE_ID,
          auteurId, date: maintenantISO, synchro: 0,
        })
      }
    }
  }

  for (const q of AU_QUAI) {
    produits.push({
      id: q.id, rayonId: rayonMed, categorieId: q.cat, nomFr: q.nom,
      codeBarres: q.cb, unite: q.unite as ProduitRow['unite'],
      seuil: q.seuil, actif: true, dci: q.dci, paysOrigine: q.pays,
    })
    const lotId = `${q.id}-lot1`
    lots.push({
      id: lotId, produitId: q.id, numero: q.lot,
      peremption: q.peremption === null ? undefined : jour(q.peremption),
      quantite: 0, emplacementId: ATTENTE_ID,
    })
    mouvements.push({
      id: nouvelId(), type: 'reception', rayonId: rayonMed, produitId: q.id, lotId,
      quantite: q.quantite, versEmplacementId: ATTENTE_ID,
      auteurId, date: maintenantISO, synchro: 0,
    })
  }

  await base.transaction('rw', base.produits, base.lots, base.mouvements, async () => {
    await base.produits.bulkPut(produits)
    await base.lots.bulkPut(lots)
    await base.mouvements.bulkPut(mouvements)
  })

  return { produits: produits.length, mouvements: mouvements.length }
}

/* ---------- Un responsable et un pharmacien, pour tester les mandats ---------- */

export async function chargerPersonnes(rayonMed: string, rayonMen: string): Promise<void> {
  await base.utilisateurs.bulkPut([
    { id: 'u-1', nom: 'Préparateur', role: 'preparateur', rayonsAutorises: [rayonMed, rayonMen], actif: true, longueurCode: LONGUEUR_CODE, empreinte: empreinte('u-1', '12345') },
    { id: 'u-2', nom: 'Amina', role: 'responsable', rayonsAutorises: [rayonMen], actif: true, longueurCode: LONGUEUR_CODE, empreinte: empreinte('u-2', '22222') },
    { id: 'u-3', nom: 'Dr Souley', role: 'pharmacien', rayonsAutorises: [rayonMed, rayonMen], actif: true, longueurCode: LONGUEUR_CODE, empreinte: empreinte('u-3', '33333') },
  ])

  await base.demandesApprobation.bulkPut([
    {
      id: 'dem-1', type: 'quarantaine', rayonId: rayonMed, statut: 'en_attente',
      motif: 'Lot douteux signalé à la réception',
      detail: 'Amoxicilline 500 mg — lot C1D3E — périmé depuis 4 jours',
      demandeurId: 'u-1', date: maintenant(),
    },
  ])
}