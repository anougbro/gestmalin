import { useEffect, useRef, useState } from 'react'
import { Bouton } from './Primitives'
import { LecteurCodeBarres, type CodeLu } from './Scan'

/* ============================================================
   LA FENETRE DE SCAN

   Un seul gros bouton au milieu : on peut le viser sans
   regarder. Si le code n'est pas lu — ou s'il n'y en a pas sur
   la boite — on ressort sans avoir perdu la saisie.
   ============================================================ */

export function FenetreScan({
  surCode,
  fermer,
}: {
  surCode: (code: CodeLu) => void
  fermer: () => void
  titre?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lecteurRef = useRef<LecteurCodeBarres | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const lecteur = new LecteurCodeBarres(video, surCode)
    lecteurRef.current = lecteur
    lecteur.demarrer().catch(() =>
      setErreur("Caméra indisponible. Utilise la recherche par nom."),
    )

    return () => lecteur.arreter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scan">
      <div className="scan__cadre">
        <video ref={videoRef} className="scan__video" muted playsInline />
        <div className="scan__vise" aria-hidden="true" />
        <div className="scan__pied">
          <p className="scan__legende">
            {erreur ?? 'Cadrez le code dans le rectangle'}
          </p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <Bouton variante="secondaire" icone="clavier" plein surClick={fermer}>
          Chercher à la main
        </Bouton>
      </div>
    </div>
  )
}