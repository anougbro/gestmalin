import { describe, expect, it } from 'vitest'
import {
  aLeDroit, empreinte, codeCorrect, aLeMandat, peutValider,
  peutUtiliser, rayonsUtilisables, roleEffectif, connecter, LONGUEUR_CODE, type Utilisateur,
} from './acces'

const MAINTENANT = '2026-06-15T12:00:00Z'

function utilisateur(p: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: 'u1', nom: 'Amina', role: 'preparateur',
    rayonsAutorises: ['r-med', 'r-men'], actif: true,
    longueurCode: LONGUEUR_CODE,
    empreinte: empreinte('u1', '12345'),
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
    const e = empreinte('u1', '12345')
    expect(e).not.toContain('12345')
    expect(e).not.toContain('u1')
    expect(e.length).toBeGreaterThan(8)
  })

  it('verifie un code correct', () => {
    expect(codeCorrect('u1', '12345', empreinte('u1', '12345'))).toBe(true)
  })

  it('refuse un code faux', () => {
    expect(codeCorrect('u1', '99999', empreinte('u1', '12345'))).toBe(false)
  })

  it('le meme code pour deux personnes n\'a pas la meme empreinte', () => {
    /* Sans cela, voir l'empreinte d'un collegue permettrait de
       deviner son code, qui est souvent 1234. */
    expect(empreinte('u1', '12345')).not.toBe(empreinte('u2', '12345'))
  })

  it('l\'identifiant de la personne change l\'empreinte', () => {
    expect(empreinte('u1', '12345')).not.toBe(empreinte('u1', '12346'))
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
    const r = connecter(base, 'u1', '12345')
    expect(r.ok).toBe(true)
  })

  it('refuse un mauvais code', () => {
    expect(connecter(base, 'u1', '99999').ok).toBe(false)
  })

  it('donne le MEME message pour un code faux et un identifiant inconnu', () => {
    /* Sinon on permet de deviner quels identifiants existent,
       simplement en lisant la difference entre les messages. */
    const inconnu = connecter(base, 'u-inexistant', '12345')
    const faux = connecter(base, 'u1', '99999')
    expect(inconnu.ok).toBe(false)
    expect(faux.ok).toBe(false)
    if (!inconnu.ok && !faux.ok) expect(inconnu.raison).toBe(faux.raison)
  })

  it('refuse un compte desactive', () => {
    const r = connecter([utilisateur({ actif: false })], 'u1', '12345')
    expect(r.ok === false && r.raison).toBe('inactif')
  })

  it('ne demande PAS le rayon : le code dit qui on est', () => {
    /* Une personne qui ne travaille que sur les Menagers doit
       pouvoir entrer, meme si l'application s'est ouverte sur les
       Medicaments. Refuser ici la bloquerait sans issue. */
    const amina = utilisateur({ id: 'u2', nom: 'Amina', role: 'responsable', rayonsAutorises: ['r-men'], empreinte: empreinte('u2', '22222') })
    const r = connecter([amina], 'u2', '22222')
    expect(r.ok).toBe(true)
  })

  it('le rayon ne se verifie pas au moment du code, mais apres', () => {
    /* Deux temps distincts : s'identifier, puis avoir le droit.
       Si le second disparait, on perd le controle d'acces. */
    const amina = utilisateur({ id: 'u2', role: 'responsable', rayonsAutorises: ['r-men'] })
    expect(peutUtiliser(amina, 'r-men')).toBe(true)
    expect(peutUtiliser(amina, 'r-med')).toBe(false)
    expect(peutValider(amina, 'r-men', MAINTENANT)).toBe(true)
    expect(peutValider(amina, 'r-med', MAINTENANT)).toBe(false)
  })
})

/* ============================================================
   CE QUE VOIT LA PERSONNE

   Une regle d'acces qui filtre l'affichage mais pas le clic est
   une regle d'acces incomplete. On teste donc les deux ensemble,
   parce que c'est leur COMBINAISON qui tient la porte.
   ============================================================ */

describe('les rayons visibles', () => {
  const tous = [{ id: 'r-med' }, { id: 'r-men' }]

  it('avant la connexion, tous les rayons sont visibles', () => {
    /* L'accueil doit s'ouvrir sans code. Filtrer avant
       d'identifier reviendrait a interdire a quelqu un de voir
       ou il se trouve avant meme de s'identifier. */
    expect(rayonsUtilisables(null, tous)).toEqual(['r-med', 'r-men'])
  })

  it('une personne de Menagers ne voit que Menagers', () => {
    const gestmalinier = utilisateur({ id: 'u2', role: 'responsable', rayonsAutorises: ['r-men'] })
    expect(rayonsUtilisables(gestmalinier, tous)).toEqual(['r-men'])
  })

  it('l ordre de la liste de reference est respecte', () => {
    /* Si l'ordre venait de `rayonsAutorises`, il changerait selon
       la personne. Le meme ecran doit se lire pareil pour tous. */
    const g = utilisateur({ id: 'u', rayonsAutorises: ['r-men', 'r-med'] })
    expect(rayonsUtilisables(g, tous)).toEqual(['r-med', 'r-men'])
  })

  it('un compte desactive ne voit plus rien', () => {
    /* Inactif signifie inactif. Lui laisser voir les rayons
       serait une porte entrouverte sur une base dont il ne peut
       plus rien faire — mais dont il pourrait regarder. */
    const g = utilisateur({ role: 'responsable', rayonsAutorises: ['r-med', 'r-men'], actif: false })
    expect(rayonsUtilisables(g, tous)).toEqual([])
  })

  it('ce qui est invisible est aussi inaccessible', () => {
    /* LA propriete qui compte. Il ne suffit pas de cacher une
       pastille : la regle d'acces doit dire non aussi. C'est le
       couple des deux qui ferme la porte, et c'est lui qu'on
       teste. */
    const gestmalinier = utilisateur({ role: 'responsable', rayonsAutorises: ['r-men'] })
    const visibles = rayonsUtilisables(gestmalinier, tous)
    for (const { id } of tous) {
      /* Ce qui est visible est accessible, et — le point qui
         compte — ce qui ne l'est pas ne l'est pas non plus. */
      expect(peutUtiliser(gestmalinier, id)).toBe(visibles.includes(id))
    }
    expect(visibles).toEqual(['r-men'])
  })
})