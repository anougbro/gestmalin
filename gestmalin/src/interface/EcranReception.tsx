import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { produits, rechercher, receptionner, stockDe } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Icone } from './Icones'
import { Bouton, Champ, Entete, Stepper, Vide } from './Primitives'
import { FenetreScan } from './FenetreScan'
import type { CodeLu } from './Scan'

/* ============================================================
   LA RECEPTION — le geste le plus repetitif, donc le plus rapide

   Un scan remplit produit, lot ET peremption. Le seul champ qui
   reste a toucher, c'est la quantite.
   ============================================================ */

export function EcranReception({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()

  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<ProduitRow[]>([])
  const [choisi, setChoisi] = useState<ProduitRow | null>(null)
  const [scanner, setScanner] = useState(false)

  const [quantite, setQuantite] = useState(1)
  const [lot, setLot] = useState('')
  const [peremption, setPeremption] = useState('')
  const [enStock, setEnStock] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => setResultats(await rechercher(rayon.id, texte)))()
    return () => { annule = true; void annule }
  }, [texte, rayon])

  useEffect(() => {
    if (!choisi) return
    void stockDe(choisi.id).then(setEnStock)
  }, [choisi])

  function choisir(p: ProduitRow) {
    setChoisi(p)
    setResultats([])
    setTexte('')
    setQuantite(1)
    setMessage(null)
  }

  async function surCode(code: CodeLu) {
    setScanner(false)
    if (code.gtin) {
      const p = await produits.parCodeBarres(code.gtin)
      if (p && p.rayonId === rayon.id) {
        choisir(p)
        /* Le scan remplit le lot et la date tout seul. */
        if (code.lot) setLot(code.lot)
        if (code.peremption) setPeremption(code.peremption)
        setMessage('Scanné — il ne reste que la quantité.')
        return
      }
    }
    setMessage('Code inconnu. Recherche par nom ?')
    setScanner(false)
  }

  async function valider() {
    if (!choisi) return
    await receptionner({
      rayonId: rayon.id,
      produitId: choisi.id,
      quantite,
      numero: lot || undefined,
      peremption: peremption || undefined,
      auteurId: utilisateur?.id ?? 'anonyme',
    })
    await rafraichir()
    setChoisi(null)
    setQuantite(1)
    setLot('')
    setPeremption('')
    setMessage('Reçu. La boîte est au quai, à ranger.')
  }

  if (choisi) {
    return (
      <div className="ecran">
        <Entete titre={choisi.nomFr} surRetour={() => setChoisi(null)} />

        <div className="contenu">
          <div className="carte">
            <div className="entre">
              <span style={{ fontSize: 13, color: 'var(--c-500)' }}>En stock</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{enStock}</span>
            </div>
          </div>

          {message && (
            <div className="bandeau bandeau--neutre">
              <span className="bandeau__texte"><span className="bandeau__titre">{message}</span></span>
            </div>
          )}

          <Champ label="Quantité reçue">
            <Stepper valeur={quantite} surChangement={setQuantite} minimum={1} autoFocus />
          </Champ>

          <Champ label="N° de lot" aide="Venu du code-barre si présent">
            <input
              className="champ__saisie"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="—"
            />
          </Champ>

          <Champ label="Péremption" aide="Format : AAAA-MM-JJ">
            <input
              className="champ__saisie"
              type="date"
              value={peremption}
              onChange={(e) => setPeremption(e.target.value)}
            />
          </Champ>

          <Bouton taille={64} plein surClick={valider}>
            Valider
          </Bouton>
        </div>
      </div>
    )
  }

  if (scanner) {
    return (
      <div className="ecran" style={{ background: 'var(--c-900)' }}>
        <FenetreScan surCode={surCode} fermer={() => setScanner(false)} />
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete titre="Réception" surRetour={retour} />

      <div className="contenu">
        <button className="btn btn--primaire btn--large btn--plein" onClick={() => setScanner(true)}>
          <Icone nom="camera" taille={24} />
          Scanner la boîte
        </button>

        <Champ label="Ou chercher par nom">
          <input
            className="champ__saisie"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Paracétamol…"
            autoFocus
          />
        </Champ>

        {resultats.length > 0 ? (
          <div className="liste">
            {resultats.map((p) => (
              <button key={p.id} className="ligne" onClick={() => choisir(p)}>
                <Icone nom="capsule" taille={22} />
                <span className="ligne__corps">
                  <span className="ligne__titre">{p.nomFr}</span>
                  <span className="ligne__note">{p.codeBarres ?? '—'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : texte.trim() ? (
          <Vide
            titre="Produit inconnu"
            note="Crée sa fiche depuis l'écran Produits."
          />
        ) : (
          <p style={{ color: 'var(--c-500)', fontSize: 13.5, textAlign: 'center' }}>
            La marchandise reçue arrive au quai. Tu la poses après.
          </p>
        )}
      </div>
    </div>
  )
}
