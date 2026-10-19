/* ============================================================
   LA CAMERA

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

   Ce fichier ne fait QUEBrancher une camera. Le decoupage du code
   est dans `domaine/codeBarres.ts`, et la decision sur le code
   dans `domaine/reception.ts`. Les deux se testent sans camera.
   ============================================================ */

import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser'
import { analyserGS1, type CodeLu } from '../domaine/codeBarres'

export const FORMATS_SOUHAITES: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.UPC_A,
  BarcodeFormat.CODE_128,
  BarcodeFormat.DATA_MATRIX,
]

/* Renvoye depuis ce fichier par commodite : tout ce qui lit un
   code passe par la, et un seul endroit decide de sa forme. */
export { analyserGS1, convertirDateGS1, LONGUEUR_PLAUSIBLE } from '../domaine/codeBarres'
export type { CodeLu } from '../domaine/codeBarres'

type ConstructeurCodeLu = (code: CodeLu) => void

export class LecteurCodeBarres {
  private lecteur: BrowserMultiFormatReader | null = null
  private video: HTMLVideoElement
  private surCode: ConstructeurCodeLu
  private arrete = false

  constructor(video: HTMLVideoElement, surCode: ConstructeurCodeLu) {
    this.video = video
    this.surCode = surCode
    this.lecteur = new BrowserMultiFormatReader()

    /* La liste des formats est ecrite en haut de ce fichier, avec
       un commentaire expliquant pourquoi — mais elle n'etait
       jamais passee au decodeur. Sans cette ligne, il essaie
       TOUS les formats a chaque image. Sur un telephone lent,
       il n'a pas le temps d'aller au bout de la liste avant
       l'image suivante : le code est bien cadre, et pourtant il
       passe. L'ecran parait fige, et la personne en conclut que
       le scan est casse. Le genre de bug qui ne se voit
       qu'en tenant le telephone en main. */
    this.lecteur.possibleFormats = [...FORMATS_SOUHAITES]
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
    /* stopStreams existe sur les versions recentes de l'API.
       On l'appelle si elle est presente, sinon les controles de
       la camera ne cessent jamais. */
    const lecteur = this.lecteur as unknown as { stopStreams?: () => void }
    lecteur?.stopStreams?.()
  }
}
