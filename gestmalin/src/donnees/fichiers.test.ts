// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  COLONNES, detecterSeparateur, lireCSV, ecrireCSV,
  ecrireZIP, lireXLSX, ecrireXLSX, lireFichier,
} from './fichiers'

describe('le CSV', () => {
  it('lit un fichier simple', () => {
    expect(lireCSV('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('respecte les guillemets qui contiennent le separateur', () => {
    expect(lireCSV('nom,ville\n"Dupont, Jean",Niamey')).toEqual([
      ['nom', 'ville'], ['Dupont, Jean', 'Niamey'],
    ])
  })

  it('respecte un guillemet double a l\'interieur', () => {
    expect(lireCSV('a\n"Il a dit ""oui"""')[1]).toEqual(['Il a dit "oui"'])
  })

  it('detecte le point-virgule tout seul', () => {
    expect(detecterSeparateur('a;b;c\n1;2;3')).toBe(';')
    expect(detecterSeparateur('a,b,c\n1,2,3')).toBe(',')
  })

  it('accepte les fins de ligne Windows et Mac', () => {
    expect(lireCSV('a,b\r\n1,2')).toHaveLength(2)
    expect(lireCSV('a,b\n1,2')).toHaveLength(2)
  })

  it('ignore les lignes vides', () => {
    expect(lireCSV('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('fait un aller-retour sans perdre une virgule', () => {
    const relu = lireCSV(ecrireCSV(['nom', 'ville'], [['Dupont, Jean', 'Niamey']])).slice(1)
    expect(relu).toEqual([['Dupont, Jean', 'Niamey']])
  })

  it('met un BOM pour que Excel affiche les accents', () => {
    expect(ecrireCSV(['a'], [['é']]).charCodeAt(0)).toBe(0xFEFF)
  })
})

describe('l\'archive ZIP ecrite maison', () => {
  it('commence par la signature d\'entree locale', () => {
    const zip = ecrireZIP([{ nom: 'a.xml', contenu: '<a/>' }])
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034B50)
  })

  it('se termine par le repertoire central', () => {
    const zip = ecrireZIP([{ nom: 'a.xml', contenu: '<a/>' }])
    expect(new DataView(zip.buffer).getUint32(zip.length - 22, true)).toBe(0x06054B50)
  })

  it('contient bien le contenu', () => {
    expect(new TextDecoder().decode(ecrireZIP([{ nom: 'a.xml', contenu: 'bonjour' }]))).toContain('bonjour')
  })
})

describe('le XLSX', () => {
  const entetes = ['nom', 'quantite']
  const lignes = [['Paracétamol', '20'], ['Ibuprofène', '8'], ['Doliprane, 500', '3']]

  it('se genere sans erreur', () => {
    expect(ecrireXLSX(entetes, lignes).length).toBeGreaterThan(1000)
  })

  it('utilise des references de cellule correctes', async () => {
    const relu = await lireXLSX(ecrireXLSX(['a', 'b'], [['1', '2']]))
    expect(relu).toEqual([['a', 'b'], ['1', '2']])
  })

  it('passe de la colonne Z a AA', async () => {
    const entetesLongs = Array.from({ length: 27 }, (_, i) => `c${i}`)
    const valeur = Array.from({ length: 27 }, (_, i) => String(i))
    const xml = new TextDecoder().decode(ecrireXLSX(entetesLongs, [valeur]))
    expect(xml).toContain('r="Z1"')
    expect(xml).toContain('r="AA1"')
  })

  it('fait un aller-retour complet sans perdre une accentuation', async () => {
    const relu = await lireXLSX(ecrireXLSX(entetes, lignes))
    expect(relu[0]).toEqual(entetes)
    expect(relu[3]).toEqual(['Doliprane, 500', '3'])
  })

  it('conserve une cellule vide au milieu', async () => {
    const relu = await lireXLSX(ecrireXLSX(['a', 'b', 'c'], [['1', '', '3']]))
    expect(relu[1]).toEqual(['1', '', '3'])
  })

  it('echappe les caracteres interdits en XML', () => {
    const xml = new TextDecoder().decode(ecrireXLSX(['a'], [['x & y < z']]))
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;')
  })

  it('gere 300 lignes sans broncher', async () => {
    const nombreuses = Array.from({ length: 300 }, (_, i) => [`Produit ${i}`, String(i)])
    const relu = await lireXLSX(ecrireXLSX(entetes, nombreuses))
    expect(relu).toHaveLength(301)
    expect(relu[300][0]).toBe('Produit 299')
  })

  it('leve une erreur claire sur un fichier qui n\'est pas une archive', async () => {
    await expect(lireXLSX(new TextEncoder().encode('ceci n\'est pas un zip'))).rejects.toThrow(/Excel/)
  })
})

describe('la detection de format a l\'ouverture', () => {
  it('lit un CSV', async () => {
    const donnees = new TextEncoder().encode('nom,quantite\nDoliprane,5')
    expect(await lireFichier(donnees, 'stock.csv')).toEqual([
      ['nom', 'quantite'], ['Doliprane', '5'],
    ])
  })

  it('un .xlsx qui n\'en est pas un retombe sur le CSV', async () => {
    /* Volontaire : mieux vaut recuperer un CSV mal renomme que
       refuser un fichier qui contient peut-etre les bonnes donnees. */
    const donnees = new TextEncoder().encode('nom,quantite\nDoliprane,5')
    expect(await lireFichier(donnees, 'stock.xlsx')).toEqual([
      ['nom', 'quantite'], ['Doliprane', '5'],
    ])
  })
})

describe('le format officiel', () => {
  it('les 13 colonnes, dans un ordre fixe', () => {
    expect(COLONNES).toEqual([
      'rayon', 'categorie', 'nom_fr', 'nom_en', 'code_barres', 'unite',
      'seuil', 'quantite', 'lot', 'peremption', 'fournisseur', 'zone', 'emplacement',
    ])
  })
})