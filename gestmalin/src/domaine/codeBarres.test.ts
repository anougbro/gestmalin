import { describe, expect, it } from 'vitest'
import { analyserGS1, convertirDateGS1, LONGUEUR_PLAUSIBLE } from './codeBarres'

/* ============================================================
   LA LECTURE D'UN CODE-BARRES

   Aucun test n'existait ici. Trois bugs ont donc traverses sans
   que rien ne les voie :

   1. Un EAN-13 tout simple — le format le plus courant sur une
      boite de medicament — ne produisait AUCUN code produit. La
      reception repondait « Code inconnu » et n'ajoutait rien.

   2. Le decoupage GS1 mangeait le dernier caractere de chaque
      valeur : GTIN sans son dernier chiffre, peremption
      2027-03-3 au lieu de 2027-03-31, lot sans sa derniere
      lettre. Trois informations faussees en silence.

   3. Une date GS1 anterieure a 2000 donnait 2027 au lieu de
      2027... et, dans l'autre sens, 1998 devenait 2098.

   Un scan qui lit faux est plus dangereux qu'un scan qui
   echoue : la boite est enregistree avec une peremption fausse,
   et personne ne le voit.
   ============================================================ */

describe('un code tout en chiffres', () => {
  it('un EAN-13 devient le code produit', () => {
    /* Le cas le plus courant de tous : l'EAN-13 imprime sur la
       boite, sans rien d'autre. */
    expect(analyserGS1('3400930123456').gtin).toBe('3400930123456')
  })

  it('les espaces et tirets du lecteur sont retires', () => {
    /* Certains lecteurs rendent « 3 400930 123456 ». Sans ce
       nettoyage, le code ne correspond a rien en base. */
    expect(analyserGS1('3 400930 123456').gtin).toBe('3400930123456')
    expect(analyserGS1('340-0930-123456').gtin).toBe('3400930123456')
  })

  it('un EAN-8 est accepte', () => {
    expect(analyserGS1('12345670').gtin).toBe('12345670')
  })

  it('un UPC-A sur 12 chiffres est accepte', () => {
    expect(analyserGS1('036000291452').gtin).toBe('036000291452')
  })

  it('un GTIN-14 sur 14 chiffres est accepte', () => {
    /* Rare sur une boite, mais il ne doit pas etre rejete pour
       autant : c'est la longueur du GTIN le plus long. */
    expect(analyserGS1('00012345678905').gtin).toBe('00012345678905')
  })

  it('un code de 19 chiffres n est pas lu comme un produit', () => {
    /* Un code 128 de separateurs perdus par le lecteur : on ne
       peut pas deviner ou commence le produit et ou commence la
       date. Inventer une coupure serait pire que de ne rien lire
       — le brut est conserve, et l'ecran propose la recherche a
       la main. */
    const r = analyserGS1('3400930123456270331')
    expect(r.gtin).toBeUndefined()
    expect(r.brut).toBe('3400930123456270331')
  })

  it('un code non numerique sans parentheses ne donne rien', () => {
    /* On ne deduit pas un produit d un texte libre. */
    const r = analyserGS1('PRODUIT SANS CODE')
    expect(r.gtin).toBeUndefined()
    expect(r.brut).toBe('PRODUIT SANS CODE')
  })

  it('le code brut est toujours conserve', () => {
    /* Meme quand on ne sait pas l interpreter : il faut pouvoir
       le recopier a la main dans le champ de recherche. */
    expect(analyserGS1('peu importe').brut).toBe('peu importe')
  })
})

describe('le format GS1 avec parentheses', () => {
  const code = '(01)3400930123456(17)270331(10)A2X9F'
  const r = analyserGS1(code)

  it('le code produit a TOUS ses chiffres', () => {
    /* 13 chiffres. Le bug en mangeait un : 340093012345. Une
       recherche dans la base ne trouvait donc jamais rien. */
    expect(r.gtin).toBe('3400930123456')
    expect(r.gtin).toHaveLength(13)
  })

  it('la peremption a TOUS ses chiffres', () => {
    /* Le bug rendait 2027-03-3 : un champ date refuse cette
       valeur, et la boite partait sans date. */
    expect(r.peremption).toBe('2027-03-31')
  })

  it('le numero de lot est entier', () => {
    /* Le bug rendait A2X9. */
    expect(r.lot).toBe('A2X9F')
  })

  it('l ordre des elements n importe pas', () => {
    const r2 = analyserGS1('(10)LOT9(17)280630(01)3400930123456')
    expect(r2.gtin).toBe('3400930123456')
    expect(r2.lot).toBe('LOT9')
    expect(r2.peremption).toBe('2028-06-30')
  })

  it('le numero de serie est lu', () => {
    expect(analyserGS1('(01)3400930123456(21)SN12345').serie).toBe('SN12345')
  })

  it('un element vide ne casse pas la lecture', () => {
    const r3 = analyserGS1('(01)3400930123456(10)(17)270331')
    expect(r3.gtin).toBe('3400930123456')
    expect(r3.lot).toBe('')
    expect(r3.peremption).toBe('2027-03-31')
  })
})

describe('la date GS1', () => {
  it('AAMMJJ devient AAAA-MM-JJ', () => {
    expect(convertirDateGS1('270331')).toBe('2027-03-31')
  })

  it('le siecle est choisi correctement', () => {
    /* Le code a deux chiffres. Une medicine qui expire en 98
       doit expirer en 1998, pas en 2098 : sinon elle est jugee
       encore valable pendant 72 ans. */
    expect(convertirDateGS1('981231')).toBe('1998-12-31')
    expect(convertirDateGS1('000101')).toBe('2000-01-01')
    expect(convertirDateGS1('991231')).toBe('1999-12-31')
  })

  it('une medicine de l an prochain n est pas rejetee comme perimee', () => {
    /* Le test inverse : 27 est 2027. Une regle de siecle mal
       ecrite — l'ordre de la comparaison inverse — transformait
       2027 en 1927, et faisait jeter des boite parfaitement
       bonnes. */
    expect(convertirDateGS1('270331')).toBe('2027-03-31')
    expect(convertirDateGS1('281231')).toBe('2028-12-31')
  })

  it('une date GS1 deja complete passe a travers', () => {
    /* Certains DataMatrix encodent 6 chiffres, d'autres la date
       complete. Dans le deuxieme cas, AAMMJJ donnerait une date
       fausse sans prevenir. */
    expect(convertirDateGS1('20270331')).toBe('2027-03-31')
  })
})

describe('ce que la reception peut faire', () => {
  it('presque tous les codes usuels donnent un produit', () => {
    /* C'est la Synthese : sur une boite de pharmacie, combien
       de formats usuels finissent par ne donner aucun produit ?
       La reponse doit etre zero. */
    const formats = [
      '3400930123456',
      '3 400930 123456',
      '340-0930-123456',
      '12345670',
      '036000291452',
      '(01)3400930123456(17)270331(10)A2X9F',
      '(01)3400930123456',
    ]
    const sansGtin = formats.filter((f) => !analyserGS1(f).gtin)
    expect(sansGtin).toEqual([])
  })

  it('la longueur plausible d un code se reconnait', () => {
    /* Une longueur plausible permet de dire « ce code n existe
       pas » plutot que « code inconnu », et de proposer une
       creation. */
    expect(LONGUEUR_PLAUSIBLE('3400930123456')).toBe(true)
    expect(LONGUEUR_PLAUSIBLE('123')).toBe(false)
    expect(LONGUEUR_PLAUSIBLE('PRODUIT')).toBe(false)
  })
})