/* ============================================================
   LE LECTEUR DE CODE-BARRES

   Deux chemins, tous les deux hors ligne :

   1. BarcodeDetector : l'API native de Chrome. Rapide, mais
      pas presente sur tous les telephones.
   2. ZXing embarque : le filet de securite. Le fichier est
      DANS l'application, rien n'est telecharge au moment de
      scanner — c'est ce qui garantit que le scan marche dans
      une reserve sans reseau.

   On ne demande au decodeur que quatre formats. Forcer la
   recherche de tous les formats possibles est la premiere
   cause d'un scan lent et peu fiable.
   ============================================================ */

import { BrowserMultiFormatReader } from '@zxing/browser'

export const FORMATS_SOUHAITES = ['EAN_13', 'UPC_A', 'CODE_128', 'DATA_MATRIX'] as const

export type CodeLu = {
  brut: string
  gtin?: string
  lot?: string
  peremption?: string
  serie?: string
}

/* ---------- Un code GS1 contient plusieurs informations ----------
   On ne se contente pas de lire : on DECOUPE.

   (01) GTIN        le produit
   (10) lot         le numero de lot
   (17) peremption  la date, en AAMMJJ
   (21) serie       le numero unique de la boite

   C'est ce qui permet de remplir quatre champs d'un seul scan. */

export function analyserGS1(brut: string): CodeLu {
  const code: CodeLu = { brut }
  /* Format element-string : (01)3400930...(17)270331(10)A2X9F */
  const elements = brut.match(/\((\d{2,4})\)([^(]*)/g)
  if (!elements) return code

  for (const element of elements) {
    const cle = element.slice(1, 3)
    const valeur = element.slice(4, -1)
    switch (cle) {
      case '01': code.gtin = valeur; break
      case '10': code.lot = valeur; break
      case '17': code.peremption = convertirDateGS1(valeur); break
      case '21': code.serie = valeur; break
    }
  }
  return code
}

/* GS1 utilise AAMMJJ. On rend 'AAAA-MM-JJ', le format qu'on
   stocke partout ailleurs. */
export function convertirDateGS1(aammjj: string): string {
  const annee = aammjj.slice(0, 2)
  return `20${annee}-${aammjj.slice(2, 4)}-${aammjj.slice(4, 6)}`
}

/* ---------- La detection ---------- */

type ConstructeurCodeLu = (code: CodeLu) => void

export class LecteurCodeBarres {
  private lecteur?: BrowserMultiFormatReader
  private arrete = false

  constructor(
    private video: HTMLVideoElement,
    private surCode: ConstructeurCodeLu,
  ) {
    this.lecteur = new BrowserMultiFormatReader()
  }

  async demarrer(): Promise<void> {
    this.arrete = false
    await this.lecteur?.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      this.video,
      (result) => {
        if (this.arrete || !result) return
        const texte = result.getText()
        this.arrete = true
        this.surCode(analyserGS1(texte))
      },
    )
  }

  arreter(): void {
    this.arrete = true
    this.lecteur?.reset()
  }
}