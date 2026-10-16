/* ============================================================
   LECTURE ET ECRITURE DE FICHIERS — sans aucune dependance

   Pourquoi pas une bibliotheque ?
   Cette application est 100 % locale et gere des produits
   medicamentaux. Chaque dependance ajoute du code tiers dans
   l'ordinateur ou les produits sont comptabilises. On ecrit
   donc nous-memes ce qui est necessaire, et rien de plus.

   Deux formats :
   - CSV  : le plus simple, s'ouvre partout, y compris
            Google Sheets, Excel et LibreOffice.
   - XLSX : le vrai classeur Excel. Un `.xlsx` est une
            archive ZIP de quelques fichiers XML. On lit et on
            ecrit donc directement ces fichiers, en utilisant
            le DecompressionStream du navigateur pour
            decompresser. Rien n'est telecharge.
   ============================================================ */

/* ---------- Les colonnes du format officiel ---------- */

export const COLONNES = [
  'rayon', 'categorie', 'nom_fr', 'nom_en', 'code_barres', 'unite',
  'seuil', 'quantite', 'lot', 'peremption', 'fournisseur', 'zone', 'emplacement',
] as const

export type NomColonne = (typeof COLONNES)[number]

/* ---------- L'echantillon ---------- */

export type LigneFichier = {
  brut: Record<string, string>
  /* Renseignes apres controle */
  colonne: NomColonne | null
  ligne: number
  problemes: string[]
  valide: boolean
}

/* ============================================================
   LE CSV
   ============================================================ */

/**
 * Separateur automatique : la France et le Niger utilisent la
 * virgule, mais un fichier venu d'un-tableur anglais peut
 * utiliser le point-virgule.
 */
export function detecterSeparateur(texte: string): string {
  const premiere = texte.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const virgules = (premiere.match(/,/g) ?? []).length
  const pointsVirgules = (premiere.match(/;/g) ?? []).length
  return pointsVirgules > virgules ? ';' : ','
}

export function lireCSV(texte: string, separateur?: string): string[][] {
  const s = separateur ?? detecterSeparateur(texte)
  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let dansGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]

    /* Un guillemet double a l'interieur d'un guillemet = un guillemet */
    if (dansGuillemets && c === '"' && texte[i + 1] === '"') {
      champ += '"'
      i++
      continue
    }
    if (c === '"') { dansGuillemets = !dansGuillemets; continue }
    if (!dansGuillemets && c === s) { ligne.push(champ); champ = ''; continue }
    if (!dansGuillemets && (c === '\n' || c === '\r')) {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ); champ = ''
      if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne)
      ligne = []
      continue
    }
    champ += c
  }
  ligne.push(champ)
  if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne)

  return lignes
}

function echapperCSV(valeur: string, separateur: string): string {
  if (valeur.includes(separateur) || valeur.includes('"') || valeur.includes('\n')) {
    return `"${valeur.replace(/"/g, '""')}"`
  }
  return valeur
}

export function ecrireCSV(entetes: readonly string[], lignes: readonly (readonly string[])[], separateur = ','): string {
  const parties = [entetes.map((e) => echapperCSV(e, separateur)).join(separateur)]
  for (const l of lignes) parties.push(l.map((v) => echapperCSV(String(v), separateur)).join(separateur))
  /* BOM UTF-8 : sans lui, Excel affiche les accents de travers. */
  return '﻿' + parties.join('\r\n')
}

/* ============================================================
   LE XLSX — un ZIP de fichiers XML
   ============================================================ */

const ENCODER = new TextEncoder()

/* ---------- CRC32 : le controle qu'attend le format ZIP ---------- */

let tableCRC: Uint32Array | null = null
function crc32(donnees: Uint8Array): number {
  if (!tableCRC) {
    tableCRC = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      tableCRC[n] = c >>> 0
    }
  }
  let crc = 0xFFFFFFFF
  for (const octet of donnees) crc = tableCRC[(crc ^ octet) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * Ecrit une archive ZIP, SANS compression.
 * Le format accepte les entrees non compressees, et un fichier
 * de 200 lignes ne pese que quelques kilo-octets : compresser
 * n'apporterait rien et Adding une dependance pour ça serait
 * disproportionne.
 */
export function ecrireZIP(fichiers: { nom: string; contenu: string }[]): Uint8Array {
  const morceaux: Uint8Array[] = []
  const central: Uint8Array[] = []
  let decalage = 0

  for (const f of fichiers) {
    const nom = ENCODER.encode(f.nom)
    const donnees = ENCODER.encode(f.contenu)
    const controle = crc32(donnees)

    const entete = new Uint8Array(30 + nom.length)
    const dv = new DataView(entete.buffer)
    dv.setUint32(0, 0x04034B50, true)   // signature d'entree locale
    dv.setUint16(4, 20, true)           // version
    dv.setUint16(6, 0, true)            // methode 0 = stocke
    dv.setUint16(8, 0, true)            // heure
    dv.setUint16(10, 0x21, true)        // date fixe : reproductible
    dv.setUint32(14, controle, true)
    dv.setUint32(18, donnees.length, true)
    dv.setUint32(22, donnees.length, true)
    dv.setUint16(26, nom.length, true)
    dv.setUint16(28, 0, true)
    entete.set(nom, 30)

    morceaux.push(entete, donnees)

    const cd = new Uint8Array(46 + nom.length)
    const dv2 = new DataView(cd.buffer)
    dv2.setUint32(0, 0x02014B50, true)  // signature d'entree centrale
    dv2.setUint16(4, 20, true)
    dv2.setUint16(6, 20, true)
    dv2.setUint16(8, 0, true)
    dv2.setUint16(10, 0, true)
    dv2.setUint16(12, 0x21, true)
    dv2.setUint32(16, controle, true)
    dv2.setUint32(20, donnees.length, true)
    dv2.setUint32(24, donnees.length, true)
    dv2.setUint16(28, nom.length, true)
    dv2.setUint32(42, decalage, true)
    cd.set(nom, 46)
    central.push(cd)

    decalage += entete.length + donnees.length
  }

  const tailleCentrale = central.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const dv3 = new DataView(fin.buffer)
  dv3.setUint32(0, 0x06054B50, true)
  dv3.setUint16(8, fichiers.length, true)
  dv3.setUint16(10, fichiers.length, true)
  dv3.setUint32(12, tailleCentrale, true)
  dv3.setUint32(16, decalage, true)

  const total = decalage + tailleCentrale + 22
  const sortie = new Uint8Array(total)
  let pos = 0
  for (const m of [...morceaux, ...central, fin]) { sortie.set(m, pos); pos += m.length }
  return sortie
}

/* ---------- La lecture ---------- */

async function lireEntreeZIP(donnees: Uint8Array): Promise<{ nom: string; contenu: Uint8Array }> {
  const vue = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength)

  /* On localise d'abord la FIN du repertoire central (EOCD),
     puis on lit dedans l'adresse de son debut.

     Chercher directement la signature d'entree centrale en
     remontant, et s'arreter a la premiere trouvee, ne marche
     pas : il y a UNE entree centrale par fichier, donc on
     tomberait sur la derniere et on passerait a cote de la
     premiere. */
  let eocd = -1
  for (let i = donnees.length - 22; i >= 0 && i > donnees.length - 66000; i--) {
    if (vue.getUint32(i, true) === 0x06054B50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("Ce fichier n'est pas une archive Excel.")

  const nombreEntrees = vue.getUint16(eocd + 10, true)
  let p = vue.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()

  for (let i = 0; i < nombreEntrees; i++) {
    const methode = vue.getUint16(p + 10, true)
    const taille = vue.getUint32(p + 24, true)
    const longueurNom = vue.getUint16(p + 28, true)
    const extra = vue.getUint16(p + 30, true)
    const commentaire = vue.getUint16(p + 32, true)
    const decalageLocal = vue.getUint32(p + 42, true)

    const nom = decoder.decode(donnees.subarray(p + 46, p + 46 + longueurNom))

    /* L'entree locale repete le nom, a un decalage different. */
    const longueurNomLocal = vue.getUint16(decalageLocal + 26, true)
    const extraLocal = vue.getUint16(decalageLocal + 28, true)
    const debut = decalageLocal + 30 + longueurNomLocal + extraLocal
    const donneesEntree = donnees.subarray(debut, debut + taille)

    if (nom === 'xl/sharedStrings.xml' || nom === 'xl/worksheets/sheet1.xml') {
      let contenu = donneesEntree
      if (methode === 8) {
        const flux = new Blob([donneesEntree]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        contenu = new Uint8Array(await new Response(flux).arrayBuffer())
      }
      return { nom, contenu }
    }

    p += 46 + longueurNom + extra + commentaire
  }

  throw new Error('Ce classeur ne contient aucune feuille lisible.')
}

/** Lit un `.xlsx` et rend un tableau de tableaux (comme lireCSV). */
export async function lireXLSX(donnees: Uint8Array): Promise<string[][]> {
  const { nom, contenu } = await lireEntreeZIP(donnees)
  const texte = new TextDecoder().decode(contenu)
  const doc = new DOMParser().parseFromString(texte, 'application/xml')

  /* Excel range les textes dans un tableau commun : on doit le
     lire d'abord pour pouvoir reconstruire les cellules. */
  const partages: string[] = []
  if (nom === 'xl/sharedStrings.xml') {
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      partages.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))
    }
  }

  if (nom === 'xl/worksheets/sheet1.xml') return lireFeuille(doc, partages)
  return []
}

function lireFeuille(doc: Document, partages: string[]): string[][] {
  const lignes: string[][] = []

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const valeurs: string[] = []
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const type = c.getAttribute('t')
      const valeurNode = Array.from(c.childNodes).find(
        (n) => n.nodeName === 'v' || n.nodeName === 'is',
      ) as Element | undefined

      let texte = valeurNode?.textContent ?? ''
      if (type === 's') texte = partages[Number(texte)] ?? ''
      else if (type === 'inlineStr') {
        texte = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')
      }
      valeurs.push(texte)
    }
    lignes.push(valeurs)
  }

  return lignes
}

/* ---------- L'ecriture d'un vrai classeur ---------- */

function echapperXML(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* Excel compte les colonnes a partir de 1 : A, B, C… AA.
   On passe donc j+1 et non j — sinon la deuxieme colonne
   s'appellerait aussi A, et Excel refuserait le fichier. */
function referenceCellule(colonne: number, ligne: number): string {
  let nom = ''
  let n = colonne
  while (n > 0) {
    const reste = (n - 1) % 26
    nom = String.fromCharCode(65 + reste) + nom
    n = Math.floor((n - 1) / 26)
  }
  return `${nom}${ligne + 1}`
}

export function ecrireXLSX(entetes: readonly string[], lignes: readonly (readonly string[])[]): Uint8Array {
  const tous = [entetes, ...lignes]

  const corps = tous
    .map((ligne, i) => {
      /* La cellule est ecrite MEME quand elle est vide. Sauter une
         cellule vide ferait glisser la suivante d'une colonne vers
         la gauche : le fichier ne serait plus fidele a l'original. */
      const cellules = ligne
        .map((valeur, j) =>
          `<c r="${referenceCellule(j + 1, i)}" t="inlineStr">` +
          `<is><t xml:space="preserve">${echapperXML(valeur === undefined || valeur === null ? '' : String(valeur))}</t></is></c>`,
        )
        .join('')
      return `<row r="${i + 1}">${cellules}</row>`
    })
    .join('')

  return ecrireZIP([
    {
      nom: '[Content_Types].xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      nom: '_rels/.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nom: 'xl/workbook.xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Produits" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      nom: 'xl/_rels/workbook.xml.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    {
      nom: 'xl/worksheets/sheet1.xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${corps}</sheetData></worksheet>`,
    },
  ])
}

/* ---------- Les deux ensemble ---------- */

export async function lireFichier(donnees: Uint8Array, nomFichier: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(nomFichier)) {
    try {
      return await lireXLSX(donnees)
    } catch {
      /* Certains fichiers Excel sont en fait des .xls ancien format,
         illisible ici. On retombe sur le CSV. */
      return lireCSV(new TextDecoder().decode(donnees))
    }
  }
  return lireCSV(new TextDecoder().decode(donnees))
}