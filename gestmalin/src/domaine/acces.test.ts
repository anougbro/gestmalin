import { describe, expect, it } from 'vitest'
import {
  aLeDroit, empreinte, codeCorrect, aLeMandat, peutValider,
  peutUtiliser, roleEffectif, connecter, type Utilisateur,
} from './acces'

const MAINTENANT = '2026-06-15T12:00:00Z'

function utilisateur(p: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: 'u1', nom: 'Amina', role: 'preparateur',
    rayonsAutorises: ['r-med', 'r-men'], actif: true,
    empreinte: empreinte('u1', '1234'),
    ...p,
  }
}

describe('les droits par role', () => {
  it('le preparateur ne fait que du stock', () => {
    const u = utilisateur()
    expect(aLeDroit(u.role, 'mouvements')).toBe(true)
    expect(aLeDroit(u.role, 'valider')).toBe(false)
    expect(aLeDroit(u.role, 'utilisateurs')).toBe(false)
  })

  it('le responsable valide, mais pas les references', () => {
    expect(aLeDroit('responsable', 'valider')).toBe(true)
    expect(aLeDroit('responsable', 'referentiels')).toBe(false)
  })

  it('le pharmacien valide et gere les references', () => {
    expect(aLeDroit('pharmacien', 'valider')).toBe(true)
    expect(aLeDroit('pharmacien', 'referentiels')).toBe(true)
  })

  it('le directeur gere aussi les utilisateurs', () => {
    expect(aLeDroit('directeur', 'utilisateurs')).toBe(true)
  })
})

describe('l\'empreinte du code', () => {
  it('ne ressemble a rien de lisible', () => {
    const e = empreinte('u1', '1234')
    expect(e).not.toContain('1234')
    expect(e).not.toContain('u1')
    expect(e.length).toBeGreaterThan(8)
  })

  it('verifie un code correct', () => {
    expect(codeCorrect('u1', '1234', empreinte('u1', '1234'))).toBe(true)
  })

  it('refuse un code faux', () => {
    expect(codeCorrect('u1', '9999', empreinte('u1', '1234'))).toBe(false)
  })

  it('le meme code pour deux personnes n\'a pas la meme empreinte', () => {
    /* Sans cela, voir l'empreinte d'un collegue permettrait de
       deviner son code, qui est souvent 1234. */
    expect(empreinte('u1', '1234')).not.toBe(empreinte('u2', '1234'))
  })

  it('l\'identifiant de la personne change l\'empreinte', () => {
    expect(empreinte('u1', '1234')).not.toBe(empreinte('u1', '1235'))
  })
})

describe('les mandats', () => {
  const mandat = (debut: string, fin: string, rayonId = 'r-med') => ({
    id: 'm1', delegataireId: 'u1', deleguanteId: 'u9', rayonId, debut, fin,
  })

  it('un mandat hors de sa fenetre ne vaut rien', () => {
    const u = utilisateur({ mandats: [mandat('2026-06-01', '2026-06-10')] })
    expect(aLeMandat(u, 'r-med', MAINTENANT)).toBe(false)
  })

  it('un mandat dans sa fenetre vaut', () => {
    const u = utilisateur({ mandats: [mandat('2026-06-01', '2026-06-20')] })
    expect(aLeMandat(u, 'r-med', MAINTENANT)).toBe(true)
  })

  it('un mandat expire ne se renouvelle pas tout seul', () => {
    /* Le point le plus important : un delegation temporaire qui
       devient permanente par oubli, ce n'est plus une delegation. */
    const u = utilisateur({ mandats: [mandat('2026-06-01', '2026-06-15')] })
    expect(aLeMandat(u, 'r-med', '2026-06-15T12:00:00Z')).toBe(true)
    expect(aLeMandat(u, 'r-med', '2026-06-16T12:00:00Z')).toBe(false)
  })

  it('un mandat ne vaut QUE sur son rayon', () => {
    const u = utilisateur({ mandats: [mandat('2026-06-01', '2026-06-20', 'r-med')] })
    expect(aLeMandat(u, 'r-men', MAINTENANT)).toBe(false)
  })
})

describe('ce qu\'une personne peut faire', () => {
  it('un preparateur ne valide pas, meme sur son rayon', () => {
    expect(peutValider(utilisateur(), 'r-med', MAINTENANT)).toBe(false)
  })

  it('un responsable valide sur SON rayon', () => {
    const u = utilisateur({ role: 'responsable', rayonsAutorises: ['r-men'] })
    expect(peutValider(u, 'r-men', MAINTENANT)).toBe(true)
    expect(peutValider(u, 'r-med', MAINTENANT)).toBe(false)
  })

  it('un mandat donne le droit de valider, meme sans le role', () => {
    const u = utilisateur({
      role: 'preparateur',
      rayonsAutorises: ['r-med'],
      mandats: [{ id: 'm1', delegataireId: 'u1', deleguanteId: 'u9', rayonId: 'r-med', debut: '2026-06-14', fin: '2026-06-18' }],
    })
    expect(peutValider(u, 'r-med', MAINTENANT)).toBe(true)
    expect(roleEffectif(u, 'r-med', MAINTENANT)).toBe('Mandat du pharmacien')
  })

  it('un compte desactive ne peut rien faire', () => {
    expect(peutUtiliser(utilisateur({ actif: false }), 'r-med')).toBe(false)
  })
})

describe('la connexion hors ligne', () => {
  const base = [utilisateur()]

  it('accepte le bon code', () => {
    const r = connecter(base, 'u1', '1234', 'r-med')
    expect(r.ok).toBe(true)
  })

  it('refuse un mauvais code', () => {
    expect(connecter(base, 'u1', '9999', 'r-med').ok).toBe(false)
  })

  it('donne le MEME message pour un code faux et un identifiant inconnu', () => {
    /* Sinon on permet de deviner quels identifiants existent,
       simplement en lisant la difference entre les messages. */
    const inconnu = connecter(base, 'u-inexistant', '1234', 'r-med')
    const faux = connecter(base, 'u1', '9999', 'r-med')
    expect(inconnu.ok).toBe(false)
    expect(faux.ok).toBe(false)
    if (!inconnu.ok && !faux.ok) expect(inconnu.raison).toBe(faux.raison)
  })

  it('refuse un compte desactive', () => {
    const r = connecter([utilisateur({ actif: false })], 'u1', '1234', 'r-med')
    expect(r.ok === false && r.raison).toBe('inactif')
  })

  it('refuse un rayon non autorise', () => {
    const r = connecter(base, 'u1', '1234', 'r-inexistant')
    expect(r.ok === false && r.raison).toBe('rayon-refuse')
  })
})