import { afterEach, describe, expect, it } from 'vitest'
import { base } from './base'
import { toutEffacer } from './depots'
import {
  CODE_INITIAL, CODE_PAR_DEFAUT, reparerComptes, UTILISATEUR_INITIAL,
  demarrer, oublierAmorcage,
} from '../etat/preparation'
import { ATTENTE_ID } from './base'
import { empreinte, connecter, LONGUEUR_CODE } from '../domaine/acces'

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
      longueurCode: 4,
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
      empreinte: empreinte(UTILISATEUR_INITIAL.id, '54321'),
    })
    expect(await reparerComptes()).toBe(0)

    /* Le code choisi par la personne est preserve : la reparation
       ne doit pas ecraser un code qui fonctionne. */
    const r = connecter(await base.utilisateurs.toArray(), 'u-1', '54321')
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

describe("le changement de longueur du code", () => {
  /* Le passage de 4 a 5 chiffres est le meme piege que celui d'une
     base creee sans empreinte : toutes les empreintes existantes
     deviennent introuvables, et personne ne peut plus entrer.

     Le champ `longueurCode` est ce qui rend la chose detectable.
     Sans lui, une empreinte a 4 chiffres et une a 5 sont la meme
     chaine pour la base : rien ne permet de savoir qu'il faut
     refaire. */
  async function baseAvecAnciensCodes() {
    await base.utilisateurs.bulkPut([
      {
        id: 'u-1',
        nom: 'Préparateur',
        role: 'preparateur',
        rayonsAutorises: ['r-med', 'r-men'],
        actif: true,
        longueurCode: 4,
        empreinte: empreinte('u-1', '1234'),
      },
      {
        id: 'u-2',
        nom: 'Amina',
        role: 'responsable',
        rayonsAutorises: ['r-men'],
        actif: true,
        longueurCode: 4,
        empreinte: empreinte('u-2', '1111'),
      },
    ])
  }

  it('AVANT reparation, aucun ancien code ne fonctionne', async () => {
    await baseAvecAnciensCodes()
    const tous = await base.utilisateurs.toArray()
    expect(connecter(tous, 'u-1', '1234').ok).toBe(false)
    expect(connecter(tous, 'u-2', '1111').ok).toBe(false)
  })

  it('la reparation en remet CHAQUE compte a la bonne longueur', async () => {
    await baseAvecAnciensCodes()
    expect(await reparerComptes()).toBe(2)

    const tous = await base.utilisateurs.toArray()
    expect(connecter(tous, 'u-1', CODE_INITIAL).ok).toBe(true)
    expect(connecter(tous, 'u-2', CODE_PAR_DEFAUT).ok).toBe(true)

    for (const u of tous) expect(u.longueurCode).toBe(LONGUEUR_CODE)
  })

  it('la longueur est inscrite dans l empreinte, pas deduite', async () => {
    /* Deux codes qui ne different que par un zero ne doivent pas
       donner la meme empreinte. */
    expect(empreinte('u-1', '12345')).not.toBe(empreinte('u-1', '1234'))
  })

  it('une base deja a la bonne longueur n est pas touchee', async () => {
    await base.utilisateurs.put({
      ...UTILISATEUR_INITIAL,
      longueurCode: LONGUEUR_CODE,
      empreinte: empreinte('u-1', '54321'),
    })
    expect(await reparerComptes()).toBe(0)
    expect(connecter(await base.utilisateurs.toArray(), 'u-1', '54321').ok).toBe(true)
  })

  it("le code de secours a la bonne longueur aussi", () => {
    expect(CODE_PAR_DEFAUT).toHaveLength(LONGUEUR_CODE)
    expect(CODE_INITIAL).toHaveLength(LONGUEUR_CODE)
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