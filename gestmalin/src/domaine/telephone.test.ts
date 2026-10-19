import { describe, expect, it } from 'vitest'
import {
  connecter, connecterParNumero, normaliserTelephone, numeroLibre,
  telephoneSaisi, LONGUEUR_TELEPHONE, empreinte, type Utilisateur,
} from './acces'

/* ============================================================
   LE NUMERO DE TELEPHONE

   Le numero remplace le choix du nom a la connexion. On tape son
   numero, on tape son code, on entre.

   Deux personnes qui partagent le meme numero, c'est un acces qui
   ouvre la mauvaise personne : le code de l'une ouvre le compte de
   l'autre, et le cloisonnement des rayons ne vaut plus rien. C'est
   la regle que ces tests gardent.
   ============================================================ */

function compte(p: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: 'u1', nom: 'Amina', role: 'responsable',
    rayonsAutorises: ['r-men'], actif: true,
    independant: true,
    telephone: '9012345678',
    longueurCode: 5,
    empreinte: 'abc-def-ghi',
    ...p,
  }
}

describe('mettre le numero en forme', () => {
  it('ne garde que les chiffres', () => {
    expect(normaliserTelephone('90 12 34 56 78')).toBe('9012345678')
    expect(normaliserTelephone('90-12-34-56-78')).toBe('9012345678')
    expect(normaliserTelephone('+227 90 12 34 56 78')).toBe('9012345678')
  })

  it('complit a gauche, comme on complete un numero', () => {
    /* « 90123456 » et « 090123456 » sont le meme numero au
       Niger : on ne les ecrit jamais pareil, mais ce sont les
       memes dix chiffres. Completer a gauche les rapproche ;
       completer a droite ou refuser les separerait en deux
       comptes. */
    expect(normaliserTelephone('90123456')).toBe('0090123456')
    expect(normaliserTelephone('90123456')).toBe(normaliserTelephone('090123456'))
  })
  it('rogne ce qui depasse', () => {
    expect(normaliserTelephone('002279012345678')).toBe('9012345678')
  })

  it('une saisie n est prete qu a dix chiffres', () => {
    /* C'est ici qu'une faute de frappe est attrapee : neuf
       chiffres refuses a la saisie, c'est un numero corrige.
       Acceptes puis enregistres, c'est un numero definitif
       auquel on n'a plus acces. */
    expect(telephoneSaisi('901234567')).toBe(false)
    expect(telephoneSaisi('9012345678')).toBe(true)
    expect(telephoneSaisi('901 234 5678')).toBe(true)
    expect(telephoneSaisi('90 12 34 56 78 9')).toBe(false)
  })

  it('dix chiffres, sans indicatif', () => {
    expect(LONGUEUR_TELEPHONE).toBe(10)
  })
})

describe('le numero est unique', () => {
  const pharmacie = compte({ id: 'u1', telephone: '9012345678' })
  const menager = compte({ id: 'u2', nom: 'Amina', telephone: '9076543210' })

  it('un numero deja pris est refuse', () => {
    expect(numeroLibre([pharmacie, menager], '9012345678')).toBe(false)
    expect(numeroLibre([pharmacie, menager], '9076543210')).toBe(false)
  })

  it('un numero libre est accepte', () => {
    expect(numeroLibre([pharmacie, menager], '9011111111')).toBe(true)
  })

  it('ecrire la meme maniere ne compte pas comme un autre numero', () => {
    /* « +227 90 12 34 56 78 » et « 9012345678 » sont le meme
       numero. Sinon la meme personne se cree un deuxieme compte
       en changeant la maniere d ecrire, et perd l acces a son
       propre stock sans savoir pourquoi. */
    expect(numeroLibre([pharmacie], '+227 90 12 34 56 78')).toBe(false)
    expect(numeroLibre([pharmacie], '90 12 34 56 78')).toBe(false)
  })

  it('se garder son propre numero est permis', () => {
    /* Sans cela, impossible de corriger une faute de frappe sur
       son propre numero : il faudrait d abord le changer. */
    expect(numeroLibre([pharmacie], '9012345678', 'u1')).toBe(true)
  })

  it('un compte sans numero ne bloque personne', () => {
    /* Les comptes anterieurs a la regle n en ont pas. Ils ne
       doivent pas interdire un numero a quelqu un d'autre. */
    expect(numeroLibre([compte({ id: 'vieux', telephone: undefined })], '9012345678')).toBe(true)
  })
})

describe('entrer par son numero', () => {
  it('le bon numero et le bon code ouvrent', () => {
    /* L'empreinte est calculee dans ces tests avec `empreinte()`.
       On fabrique donc les comptes avec la vraie empreinte. */
    const p = compte({ id: 'u1', nom: 'Pharmacie', telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const m = compte({ id: 'u2', nom: 'Menagers', telephone: '9076543210', empreinte: empreinte('u2', '22222') })
    const r = connecterParNumero([p, m], '9012345678', '12345')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.utilisateur.nom).toBe('Pharmacie')
  })

  it('le numero ouvre, mais le code d avant ouvre le mauvais compte', () => {
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const m = compte({ id: 'u2', telephone: '9076543210', empreinte: empreinte('u2', '22222') })
    const r = connecterParNumero([p, m], '9076543210', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('code-incorrect')
  })

  it('le bon numero, mal ecrit, ouvre quand meme', () => {
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const r = connecterParNumero([p], '+227 90 12 34 56 78', '12345')
    expect(r.ok).toBe(true)
  })

  it('un numero inconnu dit numero inconnu, pas code faux', () => {
    /* C'est le point le plus utile de l ecran. Un code faux
       laisse croire a une erreur de frappe et fait retaper le
       code cinq fois. Un numero inconnu signifie « ce numero
       n existe pas ici » : la personne cherche son numero, pas
       son code. */
    const p = compte({ id: 'u1', telephone: '9012345678' })
    const r = connecterParNumero([p], '9000000000', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('numero-inconnu')
  })

  it('un compte sans numero ne s ouvre pas par le numero', () => {
    const vieux = compte({ id: 'vieux', telephone: undefined })
    const r = connecterParNumero([vieux], '0000000000', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('numero-inconnu')
  })

  it('un numero partage ouvre RIEN, meme avec le bon code', () => {
    /* La regle qui vaut tout le reste. Deux comptes, le meme
       numero : on ne sait pas lequel ouvrir, et choisir le
       premier reviendrait a laisser le code de l'un ouvrir le
       mauvais rayon. On refuse les deux. */
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345'), independant: false })
    const m = compte({ id: 'u2', telephone: '9012345678', empreinte: empreinte('u2', '12345'), independant: false })
    const r = connecterParNumero([p, m], '9012345678', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('numero-partage')
  })

  it('un numero partage refuse aussi par le nom', () => {
    /* La deuxieme porte ne doit pas etre plus permissive que la
       premiere. C est le meme defaut que la liste des rayons :
       une regle appliquee a un seul endroit. */
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345'), independant: false })
    const r = connecter([p], 'u1', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('numero-partage')
  })

  it('un compte desactive ne s ouvre pas', () => {
    const p = compte({ id: 'u1', actif: false, telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const r = connecterParNumero([p], '9012345678', '12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('inactif')
  })

  it('un code trop court est refuse sans comparer', () => {
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const r = connecterParNumero([p], '9012345678', '1234')
    expect(r.ok).toBe(false)
  })

  it('un code a cinq chiffres sur un compte a quatre est refuse', () => {
    /* La migration doit etre finie AVANT que le nouveau code
       soit accepte, sinon l ancien code d autres comptes reste
       valable a cote du nouveau. */
    const p = compte({ id: 'u1', telephone: '9012345678', longueurCode: 4, empreinte: empreinte('u1', '1234') })
    const r = connecterParNumero([p], '9012345678', '1234')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('code-incorrect')
  })

  it('la liste des noms reste une porte qui marche', () => {
    /* C est le chemin de secours, et il doit ouvrir exactement
       les memes comptes que le numero. */
    const vieux = compte({ id: 'vieux', telephone: undefined, empreinte: empreinte('vieux', '12345') })
    const r = connecter([vieux], 'vieux', '12345')
    expect(r.ok).toBe(true)
  })
})

describe('aucune confusion possible entre les deux portes', () => {
  it('une personne trouvee par son numero est la meme que par son nom', () => {
    /* Si les deux chemins divergeaient, quelqu un pourrait
       entrer par une porte et se retrouver sur le compte de
       l'autre. On le verrait en comparant les deux resultats. */
    const p = compte({ id: 'u1', telephone: '9012345678', empreinte: empreinte('u1', '12345') })
    const parNumero = connecterParNumero([p], '9012345678', '12345')
    const parNom = connecter([p], 'u1', '12345')
    expect(parNumero.ok && parNom.ok).toBe(true)
    if (parNumero.ok && parNom.ok) {
      expect(parNumero.utilisateur.id).toBe(parNom.utilisateur.id)
    }
  })
})
