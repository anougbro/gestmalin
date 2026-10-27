import { afterEach, describe, expect, it } from 'vitest'
import { base } from './base'
import { toutEffacer } from './depots'
import {
  autoriser, bloquer, supprimer, supprimerTousLesComptes,
} from './personnes'
import {
  empreinte, LONGUEUR_CODE, type Role, type Utilisateur,
} from '../domaine/acces'

/* ============================================================
   LES GESTES DU DIRECTEUR SUR LES COMPTES

   Trois gestes, et trois refus qui protegent le telephone :
   - on ne se bloque pas soi-meme ;
   - on ne supprime pas son propre compte ;
   - il doit rester un directeur actif.

   Le stock ne doit jamais partir avec un compte : les mouvements
   restent, meme quand leur auteur n'existe plus.
   ============================================================ */

function compte(
  id: string,
  role: Role,
  options: { actif?: boolean; enAttente?: boolean; telephone?: string } = {},
): Utilisateur {
  return {
    id,
    nom: id,
    role,
    rayonsAutorises: ['r-med'],
    actif: options.actif ?? true,
    ...(options.enAttente ? { enAttente: true } : {}),
    independant: true,
    telephone: options.telephone ?? '9000000001',
    longueurCode: LONGUEUR_CODE,
    empreinte: empreinte(id, '12345'),
  }
}

afterEach(async () => {
  await toutEffacer()
})

describe('autoriser un compte', () => {
  it('ouvre un compte en attente et efface les essais rates', async () => {
    const dir = compte('u-01', 'directeur')
    const p = {
      ...compte('u-02', 'preparateur', { actif: false, enAttente: true }),
      tentatives: 4,
      bloqueJusqua: Date.now() + 60_000,
    }
    await base.utilisateurs.bulkPut([dir, p])

    expect(await autoriser('u-02', dir)).toBeNull()

    const apres = await base.utilisateurs.get('u-02')
    expect(apres?.actif).toBe(true)
    expect(apres?.enAttente).toBe(false)
    expect(apres?.tentatives).toBe(0)
    expect(apres?.bloqueJusqua).toBe(0)
  })

  it('refuse quelqu un qui n a pas le droit utilisateurs', async () => {
    const p = compte('u-02', 'preparateur', { actif: false, enAttente: true })
    await base.utilisateurs.put(p)

    expect(await autoriser('u-02', p)).toContain("droit")
    expect((await base.utilisateurs.get('u-02'))?.actif).toBe(false)
  })
})

describe('bloquer un compte', () => {
  it('refuse de bloquer son propre compte', async () => {
    const dir = compte('u-01', 'directeur')
    await base.utilisateurs.put(dir)

    expect(await bloquer('u-01', dir)).toContain('propre compte')
    expect((await base.utilisateurs.get('u-01'))?.actif).toBe(true)
  })

  it('ferme un autre compte, sans duree', async () => {
    const dir = compte('u-01', 'directeur')
    const p = compte('u-02', 'preparateur', { telephone: '9000000002' })
    await base.utilisateurs.bulkPut([dir, p])

    expect(await bloquer('u-02', dir)).toBeNull()

    const apres = await base.utilisateurs.get('u-02')
    expect(apres?.actif).toBe(false)
    expect(apres?.enAttente).toBe(false)
    expect(apres?.bloqueJusqua).toBe(0)
  })

  it('refuse de laisser le telephone sans directeur actif', async () => {
    const dernier = compte('u-01', 'directeur')
    await base.utilisateurs.put(dernier)

    /* Un directeur qui n'est pas dans la base : le cas ne doit
       pas passer par le bouton, mais la fonction le refuse
       elle-meme. */
    const autreDirecteur = compte('u-99', 'directeur')
    expect(await bloquer('u-01', autreDirecteur)).toContain('directeur actif')
    expect((await base.utilisateurs.get('u-01'))?.actif).toBe(true)
  })
})

describe('supprimer un compte', () => {
  it('refuse de supprimer son propre compte', async () => {
    const dir = compte('u-01', 'directeur')
    await base.utilisateurs.put(dir)

    expect(await supprimer('u-01', dir)).toContain('propre compte')
    expect(await base.utilisateurs.get('u-01')).toBeDefined()
  })

  it('efface le compte mais garde ses mouvements', async () => {
    const dir = compte('u-01', 'directeur')
    const p = compte('u-02', 'preparateur', { telephone: '9000000002' })
    await base.utilisateurs.bulkPut([dir, p])
    await base.mouvements.put({
      id: 'm-1', type: 'reception', rayonId: 'r-med', produitId: 'p-1',
      lotId: 'l-1', quantite: 5, versEmplacementId: 'e-1',
      auteurId: 'u-02', date: '2026-01-01T09:00:00Z', synchro: 0,
    })

    expect(await supprimer('u-02', dir)).toBeNull()
    expect(await base.utilisateurs.get('u-02')).toBeUndefined()
    expect(await base.mouvements.get('m-1')).toBeDefined()
  })
})

describe('effacer tous les comptes', () => {
  it('vide les comptes et laisse le stock', async () => {
    const dir = compte('u-01', 'directeur')
    const p = compte('u-02', 'preparateur', { telephone: '9000000002' })
    await base.utilisateurs.bulkPut([dir, p])
    await base.produits.put({
      id: 'p-1', rayonId: 'r-med', categorieId: 'c-1', nomFr: 'Paracétamol',
      unite: 'boite', seuil: 5, actif: true,
    })

    expect(await supprimerTousLesComptes(dir)).toBeNull()

    expect(await base.utilisateurs.count()).toBe(0)
    expect(await base.produits.get('p-1')).toBeDefined()
  })

  it('refuse quelqu un qui n a pas le droit utilisateurs', async () => {
    const p = compte('u-02', 'preparateur')
    await base.utilisateurs.put(p)

    expect(await supprimerTousLesComptes(p)).toContain("droit")
    expect(await base.utilisateurs.count()).toBe(1)
  })
})
