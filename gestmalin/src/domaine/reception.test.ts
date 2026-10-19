import { describe, expect, it } from 'vitest'
import { suiteDuCode } from './reception'
import { analyserGS1 } from './codeBarres'
import type { Produit } from './types'

/* ============================================================
   QUE FAIRE D'UN CODE LU ?

   La fonction ne touche ni a la base ni a un navigateur : elle
   raisonne sur trois choses — ce qu'on a lu, le rayon ouvert, ce
   qu'on a trouve. On peut donc lui poser les quatre situations
   d'une officine une par une, sans camera.

   Ce qui est teste ici est precisement ce qui manquait quand le
   scan a echoue sur telephone : le code etait lu correctement,
   mais ce qu'on en faisait n'avait jamais ete eprouve. Trois
   chemins sur quatre n'etaient pas verifies — dont celui du
   produit inconnu, qui est le plus courant le premier jour.
   ============================================================ */

const RAYON_MEDICAMENTS = 'medicaments'
const RAYON_MENAGERS = 'menagers'

const noms: Record<string, string> = {
  [RAYON_MEDICAMENTS]: 'Médicaments',
  [RAYON_MENAGERS]: 'Ménagers',
}
const nomDuRayon = (id: string) => noms[id]

function produit(dossier: Partial<Produit> = {}): Produit {
  return {
    id: 'p1',
    rayonId: RAYON_MEDICAMENTS,
    categorieId: '',
    nomFr: 'Paracétamol 500 mg',
    codeBarres: '3400930123456',
    unite: 'boite',
    seuil: 0,
    actif: true,
    ...dossier,
  }
}

/* ---------- 1. Le produit est la ---------- */

describe('un produit deja au catalogue, dans le bon rayon', () => {
  it('il est servi, avec le lot et la peremption du scan', () => {
    /* Le scan remplit trois champs d un coup : c est tout
       l interet du GS1. Perdre le lot ou la date, c est obliger
       la personne a les retaper sur une boite qu elle a deja
       sous les yeux. */
    const lu = analyserGS1('(01)3400930123456(17)270331(10)A2X9F')
    const s = suiteDuCode(lu, RAYON_MEDICAMENTS, produit(), nomDuRayon)

    expect(s.cas).toBe('produit')
    if (s.cas !== 'produit') return
    expect(s.produit.id).toBe('p1')
    expect(s.lot).toBe('A2X9F')
    expect(s.peremption).toBe('2027-03-31')
  })

  it('un scan sans lot laisse le champ lot vide', () => {
    /* Et non « undefined » : le champ de saisie attend une
       chaine, et afficher le mot undefined dans un formulaire
       fait peur a l ecran. */
    const s = suiteDuCode(analyserGS1('3400930123456'), RAYON_MEDICAMENTS, produit(), nomDuRayon)
    expect(s.cas).toBe('produit')
    if (s.cas !== 'produit') return
    expect(s.lot).toBe('')
    expect(s.peremption).toBe('')
  })
})

/* ---------- 2. Le produit est dans l autre rayon ---------- */

describe('un produit qui existe, mais pas dans le rayon ouvert', () => {
  it('le nom du produit ET celui du rayon sont annonces', () => {
    /* Dire « code inconnu » serait FAUX, et surtout trompeur :
       la personne croirait que sa boite n est pas referencee,
       et partirait chercher ailleurs pendant des minutes. La
       vraie information — « c est dans Ménagers » — est celle
       qui fait gagner ces minutes. */
    const s = suiteDuCode(
      analyserGS1('3400930999999'),
      RAYON_MEDICAMENTS,
      produit({ rayonId: RAYON_MENAGERS, nomFr: 'Savon de ménage' }),
      nomDuRayon,
    )

    expect(s.cas).toBe('autre-rayon')
    if (s.cas !== 'autre-rayon') return
    expect(s.produit.nomFr).toBe('Savon de ménage')
    expect(s.nomRayon).toBe('Ménagers')
  })

  it('un rayon inconnu ne fait pas planter l ecran', () => {
    /* Un produit importe d un catalogue externe peut porter un
       rayon qui n existe pas ici. L affichage doit rester
       lisible, pas montrer « undefined ». */
    const s = suiteDuCode(analyserGS1('3400930999999'), RAYON_MEDICAMENTS, produit({ rayonId: 'fantome' }), nomDuRayon)
    expect(s.cas).toBe('autre-rayon')
    if (s.cas !== 'autre-rayon') return
    expect(s.nomRayon).toBe('un autre rayon')
  })

  it('le produit de l autre rayon n est JAMAIS propose a la creation', () => {
    /* Sinon on creerait un doublon du meme produit dans le
       mauvais rayon — la cause clasique d'un stock qui ne
      DEPENSE pas parce qu'il existe deux fois. */
    const s = suiteDuCode(analyserGS1('3400930999999'), RAYON_MEDICAMENTS, produit({ rayonId: RAYON_MENAGERS }), nomDuRayon)
    expect(s.cas).not.toBe('a-creer')
  })
})

/* ---------- 3. Le produit n existe pas ---------- */

describe('un produit jamais vu — le cas le plus courant', () => {
  it('il est propose a la creation, code deja rempli', () => {
    /* Recevoir une boite neuve n est pas une erreur, c'est le
       fonctionnement normal d'une officine. L'ancien ecran
       s arretait sur « code inconnu » : il fallait quitter,
       creer la fiche dans un autre ecran, revenir, scanner a
       nouveau. Le code barre EST l identite du produit — c est
       la seule information qu on ne peut pas demander a un
       humain. */
    const s = suiteDuCode(analyserGS1('(01)3400930777777(17)280430(10)B7'), RAYON_MEDICAMENTS, null, nomDuRayon)

    expect(s.cas).toBe('a-creer')
    if (s.cas !== 'a-creer') return
    expect(s.gtin).toBe('3400930777777')
    expect(s.lot).toBe('B7')
    expect(s.peremption).toBe('2028-04-30')
  })

  it('undefined et null sont traites pareil', () => {
    /* Une requete IndexedDB peut rendre l un ou l autre selon
       le chemin. Les deux doivent creer, sinon le comportement
       change selon l'humeur de la base. */
    expect(suiteDuCode(analyserGS1('3400930777777'), RAYON_MEDICAMENTS, null, nomDuRayon).cas).toBe('a-creer')
    expect(suiteDuCode(analyserGS1('3400930777777'), RAYON_MEDICAMENTS, undefined, nomDuRayon).cas).toBe('a-creer')
  })

  it('un code non numerique ne cree RIEN', () => {
    /* Creer une fiche a partir d une lecture parasite pollue
       le catalogue pour toujours, et la personne ne saura
       jamais pourquoi ce produit-la existe. */
    const s = suiteDuCode(analyserGS1('PRODUIT SANS CODE'), RAYON_MEDICAMENTS, null, nomDuRayon)
    expect(s.cas).toBe('illisible')
    expect(s.cas === 'illisible' && s.brut).toBe('PRODUIT SANS CODE')
  })

  it('un code de 19 chiffres ne cree RIEN', () => {
    /* On ne sait pas ou commence le produit : creer une fiche
       avec un code qui n est pas le code du produit rendra le
       produit introuvable au prochain scan. */
    expect(suiteDuCode(analyserGS1('3400930123456270331'), RAYON_MEDICAMENTS, null, nomDuRayon).cas).toBe('illisible')
  })
})

/* ---------- 4. Aucun des cas ne doit disparaitre ---------- */

describe('aucune situation ne passe sans reponse', () => {
  it('les quatre destinations sont couvertes, et une seule', () => {
    /* Une union de types qui laisse passer un cas non traite
       fait qu a l execution l ecran ne montre rien — c est
       exactement le symptome « le scan marche mais il ne se
       passe rien ». Ce test oblige a nommer chaque cas. */
    const codes = ['3400930123456', '3400930999999', 'PRODUIT', '3400930123456270331']
    const vus = new Set<string>()

    for (const brut of codes) {
      const lu = analyserGS1(brut)
      vus.add(suiteDuCode(lu, RAYON_MEDICAMENTS, null, nomDuRayon).cas)
      vus.add(suiteDuCode(lu, RAYON_MEDICAMENTS, produit(), nomDuRayon).cas)
      vus.add(suiteDuCode(lu, RAYON_MEDICAMENTS, produit({ rayonId: RAYON_MENAGERS }), nomDuRayon).cas)
    }

    expect([...vus].sort()).toEqual(['a-creer', 'autre-rayon', 'illisible', 'produit'])
  })
})