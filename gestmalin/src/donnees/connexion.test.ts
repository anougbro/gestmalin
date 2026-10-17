import { afterEach, describe, expect, it } from 'vitest'
import { base } from './base'
import { toutEffacer } from './depots'
import {
  CODE_INITIAL, reparerComptes, UTILISATEUR_INITIAL,
  demarrer, oublierAmorcage,
} from '../etat/preparation'
import { ATTENTE_ID } from './base'
import { empreinte, connecter } from '../domaine/acces'

/* ============================================================
   LA CONNEXION SUR UNE BASE REELLE

   Ces tests utilisent une vraie IndexedDB (fake-indexeddb en
   memoire). C'est la seule facon de reproduire le bug qui a
   bloque la connexion : une base creee AVANT que l'empreinte
   existe.

   Un test avec un simple objet aurait passe sans rien prouver :
   le probleme n'etait pas dans la comparaison du code, mais dans
   la base qui n'avait jamais recu d'empreinte a comparer.
   ============================================================ */

afterEach(async () => {
  await toutEffacer()
  oublierAmorcage()
})

describe('une base neuve', () => {
  it('cree la personne de depart avec son code', async () => {
    await reparerComptes()
    await base.utilisateurs.put({
      ...UTILISATEUR_INITIAL,
      empreinte: empreinte(UTILISATEUR_INITIAL.id, CODE_INITIAL),
    })

    const r = connecter(await base.utilisateurs.toArray(), UTILISATEUR_INITIAL.id, CODE_INITIAL)
    expect(r.ok).toBe(true)
  })
})

describe('une base ancienne, sans empreinte', () => {
  /* C'est l'etat dans lequel etait le telephone : les personnes
     existaient, mais leur code n'avait jamais ete enregistre,
     parce que la version 1 du schema ne prevoyait pas ce champ. */

  async function creerBaseAncienne() {
    await base.rayons.put({ id: 'r-med', nom: 'Médicaments', ordre: 0 })
    /* On ecrit volontairement une ligne SANS empreinte : c'est
       exactement ce que contenait la base avant la migration. */
    await base.utilisateurs.put({
      id: 'u-1',
      nom: 'Préparateur',
      role: 'preparateur',
      rayonsAutorises: ['r-med', 'r-men'],
      actif: true,
      empreinte: '',
    })
  }

  it('avant reparation, AUCUN code ne fonctionne', async () => {
    await creerBaseAncienne()
    const r = connecter(await base.utilisateurs.toArray(), 'u-1', CODE_INITIAL)
    expect(r.ok).toBe(false)
  })

  it('apres reparation, le code de depart fonctionne', async () => {
    await creerBaseAncienne()
    const repares = await reparerComptes()
    expect(repares).toBe(1)

    const r = connecter(await base.utilisateurs.toArray(), 'u-1', CODE_INITIAL)
    expect(r.ok).toBe(true)
  })

  it('la reparation est sans effet sur une base deja saine', async () => {
    await base.utilisateurs.put({
      ...UTILISATEUR_INITIAL,
      empreinte: empreinte(UTILISATEUR_INITIAL.id, '4321'),
    })
    expect(await reparerComptes()).toBe(0)

    /* Le code choisi par la personne est preserve : la reparation
       ne doit pas ecraser un code qui fonctionne. */
    const r = connecter(await base.utilisateurs.toArray(), 'u-1', '4321')
    expect(r.ok).toBe(true)
  })
})

describe('une base sans aucune personne', () => {
  it('on en recree une, sinon personne ne peut jamais entrer', async () => {
    await base.rayons.put({ id: 'r-med', nom: 'Médicaments', ordre: 0 })
    expect(await reparerComptes()).toBe(1)

    const r = connecter(await base.utilisateurs.toArray(), 'u-1', CODE_INITIAL)
    expect(r.ok).toBe(true)
  })
})

describe('le message d echec', () => {
  it('ne distingue pas « personne inconnue » de « code faux »', async () => {
    await reparerComptes()
    await base.utilisateurs.put({
      ...UTILISATEUR_INITIAL,
      empreinte: empreinte(UTILISATEUR_INITIAL.id, CODE_INITIAL),
    })
    const tous = await base.utilisateurs.toArray()

    const inconnu = connecter(tous, 'u-9999', CODE_INITIAL)
    const faux = connecter(tous, 'u-1', '9999')
    expect(inconnu.ok).toBe(false)
    expect(faux.ok).toBe(false)
    if (!inconnu.ok && !faux.ok) expect(inconnu.raison).toBe(faux.raison)
  })
})

/* ============================================================
   L'AMORCAGE SOUS CONCURRENCE

   En developpement, React lance l'effet de demarrage DEUX fois.
   Les deux appels voyaient une base vide, effacaient, puis
   inseraient : le second echouait sur une cle deja presente, et
   l'amorcage entier etait declare casse.

   C'est reproduit ici de facon deterministe : deux appels
   simultanes, et on verrait l'echec si le garde-fou n'existait pas.
   ============================================================ */

describe("l'amorcage sous concurrence", () => {
  it('deux appels simultanes ne cassent rien', async () => {
    oublierAmorcage()
    const [a, b] = await Promise.allSettled([demarrer(), demarrer()])

    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('fulfilled')
  })

  it('la base contient bien les deux rayons, une seule fois', async () => {
    oublierAmorcage()
    await demarrer()

    const rayons = await base.rayons.toArray()
    expect(rayons).toHaveLength(2)
    expect(rayons.map((r) => r.id).sort()).toEqual(['r-med', 'r-men'])
  })

  it('apres l amorcage, on peut se connecter', async () => {
    oublierAmorcage()
    await demarrer()

    const r = connecter(await base.utilisateurs.toArray(), 'u-1', CODE_INITIAL)
    expect(r.ok).toBe(true)
  })

  it('toutes les zones ont leurs emplacements', async () => {
    oublierAmorcage()
    await demarrer()

    const zones = await base.zones.toArray()
    for (const z of zones) {
      const n = await base.emplacements.where('zoneId').equals(z.id).count()
      expect(n).toBeGreaterThan(0)
    }
  })

  it('le quai de reception existe et n appartient a aucune zone', async () => {
    oublierAmorcage()
    await demarrer()

    const quai = await base.emplacements.get(ATTENTE_ID)
    expect(quai?.zoneId).toBe('')
  })
})