import { afterEach, describe, expect, it } from 'vitest'
import { base } from './base'
import { toutEffacer } from './depots'
import { changerMail, debloquer, noterEssaiRate, oublierEssais } from './personnes'
import { CODE_PAR_DEFAUT } from '../etat/preparation'
import {
  connecter,
  DUREE_BLOCAGE_MS,
  empreinte,
  ESSAIS_MAX,
  estBloque,
  LONGUEUR_CODE,
  mailLibre,
  mailValide,
  type Role,
  type Utilisateur,
} from '../domaine/acces'

/* ============================================================
   LE BLOCAGE APRES TROP D'ESSAIS

   Ce qui compte ici n'est pas le message affiche : c'est que le
   blocage tienne. Un compteur qui vit dans l'ecran se remet a zero
   au moindre rafraichissement, et ne bloque donc rien. On verifie
   donc la base, et la porte d'entree juste apres.

   Et le deblocage : sur un telephone sans serveur, le directeur
   est le seul recours. S'il ne peut pas lever un blocage, il faut
   effacer la base — donc perdre le stock, pour cinq chiffres mal
   tapes.
   ============================================================ */

const CODE = '12345'

function compte(id: string, role: Role, nom: string): Utilisateur {
  return {
    id,
    nom,
    role,
    rayonsAutorises: ['r-med'],
    actif: true,
    independant: true,
    telephone: `90000000${id.slice(-2).padStart(2, '0')}`,
    longueurCode: LONGUEUR_CODE,
    empreinte: empreinte(id, CODE),
  }
}

afterEach(async () => {
  await toutEffacer()
})

describe('le compteur d essais', () => {
  it('decompte les essais et bloque au cinquieme', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))

    const restants: number[] = []
    for (let i = 1; i < ESSAIS_MAX; i++) {
      const r = await noterEssaiRate('u-01')
      expect(r.bloque).toBe(false)
      restants.push(r.restants)
    }
    expect(restants).toEqual([4, 3, 2, 1])

    const dernier = await noterEssaiRate('u-01')
    expect(dernier.bloque).toBe(true)
    expect(dernier.restants).toBe(0)

    const u = await base.utilisateurs.get('u-01')
    expect(estBloque(u!)).toBe(true)
    expect(u?.tentatives).toBe(ESSAIS_MAX)
  })

  it('ne bloque pas un compte inconnu', async () => {
    expect(await noterEssaiRate('u-inexistant')).toEqual({ bloque: false, restants: ESSAIS_MAX })
  })

  it('un blocage dure un quart d heure, puis tombe seul', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    for (let i = 0; i < ESSAIS_MAX; i++) await noterEssaiRate('u-01')

    const u = (await base.utilisateurs.get('u-01'))!
    /* Sans ce delai, un directeur bloque n'aurait plus aucun
       recours : personne ne peut debloquer quelqu'un qui a le
       droit de debloquer. */
    expect(u.bloqueJusqua).toBeGreaterThan(Date.now())
    expect(u.bloqueJusqua).toBeLessThanOrEqual(Date.now() + DUREE_BLOCAGE_MS)

    expect(estBloque(u, Date.now() + DUREE_BLOCAGE_MS + 1)).toBe(false)
  })

  it('une entree reussie remet le compteur a zero', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    await noterEssaiRate('u-01')
    await noterEssaiRate('u-01')

    await oublierEssais('u-01')

    const u = await base.utilisateurs.get('u-01')
    expect(u?.tentatives).toBe(0)
    expect(estBloque(u!)).toBe(false)
  })
})

describe('la porte pendant un blocage', () => {
  it('refuse meme le BON mot de passe', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    for (let i = 0; i < ESSAIS_MAX; i++) await noterEssaiRate('u-01')

    /* Comparer le code pendant le blocage offrirait des essais
       gratuits : c'est exactement ce qu'un blocage doit retirer. */
    const r = connecter(await base.utilisateurs.toArray(), 'u-01', CODE)
    expect(r).toEqual({ ok: false, raison: 'bloque' })
  })
})

describe('le deblocage', () => {
  it('refuse un preparateur', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    const refus = await debloquer('u-01', compte('u-02', 'preparateur', 'Ibrahim'))

    expect(refus).not.toBeNull()
    expect(estBloque((await base.utilisateurs.get('u-01'))!)).toBe(false)
    /* Le refus doit etre total : ni le compteur, ni le mot de
       passe ne bougent. Un bouton cache n'est pas une
       interdiction ; c'est la fonction qui doit refuser. */
  })

  it('refuse sans auteur', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    expect(await debloquer('u-01', null)).not.toBeNull()
  })

  it('le directeur leve le blocage, sans toucher au mot de passe', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    const directeur = compte('u-02', 'directeur', 'Directrice')
    await base.utilisateurs.put(directeur)
    for (let i = 0; i < ESSAIS_MAX; i++) await noterEssaiRate('u-01')

    expect(await debloquer('u-01', directeur)).toBeNull()

    const u = (await base.utilisateurs.get('u-01'))!
    expect(estBloque(u)).toBe(false)
    expect(u.tentatives).toBe(0)
    expect(connecter(await base.utilisateurs.toArray(), 'u-01', CODE).ok).toBe(true)
  })

  it('le directeur remet 00000, et le compte entre avec', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    const directeur = compte('u-02', 'directeur', 'Directrice')
    await base.utilisateurs.put(directeur)
    for (let i = 0; i < ESSAIS_MAX; i++) await noterEssaiRate('u-01')

    expect(await debloquer('u-01', directeur, CODE_PAR_DEFAUT)).toBeNull()

    const tous = await base.utilisateurs.toArray()
    expect(connecter(tous, 'u-01', CODE).ok).toBe(false)
    expect(connecter(tous, 'u-01', CODE_PAR_DEFAUT).ok).toBe(true)
  })

  it('refuse un mot de passe provisoire de la mauvaise longueur', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))
    const directeur = compte('u-02', 'directeur', 'Directrice')
    await base.utilisateurs.put(directeur)

    expect(await debloquer('u-01', directeur, '000')).not.toBeNull()
    expect(connecter(await base.utilisateurs.toArray(), 'u-01', CODE).ok).toBe(true)
  })
})

describe('le courriel', () => {
  it('ne retient pas une adresse evidentment fausse', () => {
    expect(mailValide('amina@exemple.com')).toBe(true)
    expect(mailValide('amina@exemple.ne')).toBe(true)
    expect(mailValide('amina')).toBe(false)
    expect(mailValide('amina@exemple')).toBe(false)
    expect(mailValide('amina @exemple.com')).toBe(false)
    expect(mailValide('')).toBe(false)
  })

  it('se pose et s efface', async () => {
    await base.utilisateurs.put(compte('u-01', 'preparateur', 'Amina'))

    await changerMail('u-01', 'amina@exemple.com')
    expect((await base.utilisateurs.get('u-01'))?.mail).toBe('amina@exemple.com')

    /* Vide veut dire efface, pas chaine vide : un champ vide ne
       doit pas se retrouver dans la liste des personnes comme
       une adresse. */
    await changerMail('u-01', '   ')
    const u = await base.utilisateurs.get('u-01')
    expect(u?.mail).toBeUndefined()
    expect('mail' in u!).toBe(false)
  })

  it('mailLibre compare sans tenir compte de la casse', () => {
    const avec = { ...compte('u-01', 'preparateur', 'Amina'), mail: 'Amina@Exemple.com' }
    const sans = compte('u-02', 'preparateur', 'Ibrahim')

    expect(mailLibre([avec, sans], ' amina@exemple.COM ')).toBe(false)
    expect(mailLibre([avec, sans], 'amina@exemple.com', 'u-01')).toBe(true)
    expect(mailLibre([avec, sans], 'ibrahim@exemple.com')).toBe(true)
    /* Un compte sans courriel ne reserve rien. */
    expect(mailLibre([sans], 'amina@exemple.com')).toBe(true)
  })

  it('refuse une adresse deja prise, sans rien ecrire', async () => {
    await base.utilisateurs.put({ ...compte('u-01', 'preparateur', 'Amina'), mail: 'Amina@Exemple.com' })
    await base.utilisateurs.put(compte('u-02', 'preparateur', 'Ibrahim'))

    expect(await changerMail('u-02', ' amina@exemple.com ')).toBe('Ce courriel est déjà pris.')
    expect((await base.utilisateurs.get('u-02'))?.mail).toBeUndefined()
  })

  it('laisse remettre sa propre adresse', async () => {
    await base.utilisateurs.put({ ...compte('u-01', 'preparateur', 'Amina'), mail: 'amina@exemple.com' })

    expect(await changerMail('u-01', 'AMINA@exemple.com')).toBeNull()
    expect((await base.utilisateurs.get('u-01'))?.mail).toBe('AMINA@exemple.com')
  })
})
