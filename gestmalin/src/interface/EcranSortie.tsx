import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { lotsServisEnPremier, rechercher, sortirQuantite } from '../donnees/depots'
import { quantiteProduit } from '../domaine/stock'
import type { ProduitRow } from '../donnees/base'
import type { Lot } from '../domaine/types'
import { Icone } from './Icones'
import { Bouton, Champ, Entete, Stepper } from './Primitives'
import { FenetreScan } from './FenetreScan'
import type { CodeLu } from './Scan'

/* ============================================================
   LA SORTIE — ce qui part vers un patient, ou qui se casse

   C'est ici que se joue le FEFO : l'application sert le lot qui
   PERIME EN PREMIER sans qu'on ait a le demander.
   ============================================================ */

const MOTIFS = [
  { cle: 'delivrance', mot: 'Délivrance' },
  { cle: 'casse', mot: 'Casse' },
  { cle: 'peremption', mot: 'Péremption' },
  { cle: 'vol', mot: 'Perte' },
]

export function EcranSortie({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()

  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<ProduitRow[]>([])
  const [choisi, setChoisi] = useState<ProduitRow | null>(null)
  const [scanner, setScanner] = useState(false)

  const [lots, setLots] = useState<{ lot: Lot; quantite: number }[]>([])
  const [quantite, setQuantite] = useState(0)
  const [motif, setMotif] = useState('delivrance')
  const [reste, setReste] = useState(0)

  useEffect(() => {
    ;(async () => setResultats(await rechercher(rayon.id, texte)))()
  }, [texte, rayon])

  useEffect(() => {
    if (!choisi) return
    void (async () => {
      const [servis, total] = await Promise.all([
        lotsServisEnPremier(choisi.id),
        quantiteProduit(choisi.id, await base.mouvements.where('produitId').equals(choisi.id).toArray()),
      ])
      setLots(servis)
      setQuantite(Math.min(1, total))
      setReste(total)
    })()
  }, [choisi])

  async function surCode(code: CodeLu) {
    setScanner(false)
    if (code.gtin) {
      const p = (await base.produits.where('codeBarres').equals(code.gtin).first()) ?? undefined
      if (p && p.rayonId === rayon.id) { setChoisi(p); setResultats([]); setTexte('') }
    }
  }

  async function valider() {
    if (!choisi || quantite <= 0) return
    let restant = quantite
    for (const l of lots) {
      if (restant <= 0) break
      const pris = Math.min(l.quantite, restant)
      await sortirQuantite({
        rayonId: rayon.id,
        produitId: choisi.id,
        lotId: l.lot.id,
        quantite: pris,
        motif,
        auteurId: utilisateur,
        depuisEmplacementId: l.lot.emplacementId,
      })
      restant -= pris
    }
    setReste(reste - quantite)
    await rafraichir()
    setQuantite(0)
  }

  if (scanner) {
    return (
      <div className="ecran" style={{ background: 'var(--c-900)' }}>
        <FenetreScan surCode={surCode} fermer={() => setScanner(false)} />
      </div>
    )
  }

  if (choisi) {
    const suggestions = lots.slice(0, 3)
    return (
      <div className="ecran">
        <Entete titre={choisi.nomFr} surRetour={() => setChoisi(null)} />

        <div className="contenu">
          <div className="carte">
            <div className="entre">
              <span style={{ fontSize: 13, color: 'var(--c-500)' }}>En stock</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{reste}</span>
            </div>
          </div>

          {lots.length > 0 && (
            <div>
              <p className="section__titre">Servi en premier</p>
              <div className="liste">
                {suggestions.map((l, i) => (
                  <div key={l.lot.id} className="ligne" style={{ cursor: 'default' }}>
                    <span className="destination" style={{ background: i === 0 ? 'var(--teal-700)' : 'var(--c-300)' }}>
                      {i === 0 ? '1' : String(i + 1)}
                    </span>
                    <span className="ligne__corps">
                      <span className="ligne__titre">
                        {l.lot.peremption ? `Périme ${l.lot.peremption}` : 'Sans date'}
                      </span>
                      <span className="ligne__note num">{l.quantite} disponible{l.quantite > 1 ? 's' : ''}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--c-500)', marginTop: 8 }}>
                Le lot n° 1 part en premier — c'est celui qui périme le plus tôt.
              </p>
            </div>
          )}

          <Champ label="Quantité sortie">
            <Stepper valeur={quantite} surChangement={setQuantite} minimum={0} maximum={reste} />
          </Champ>

          <div>
            <p className="section__titre">Pourquoi</p>
            <div className="grille-2">
              {MOTIFS.map((m) => (
                <button
                  key={m.cle}
                  className="tuile"
                  style={motif === m.cle
                    ? { borderColor: 'var(--teal-700)', background: 'var(--teal-50)' }
                    : undefined}
                  onClick={() => setMotif(m.cle)}
                >
                  <span className="tuile__label">{m.mot}</span>
                </button>
              ))}
            </div>
          </div>

          <Bouton taille={64} plein surClick={valider} disabled={quantite <= 0}>
            Valider
          </Bouton>
        </div>
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete titre="Sortie" surRetour={retour} />

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

        {resultats.length > 0 && (
          <div className="liste">
            {resultats.map((p) => (
              <button key={p.id} className="ligne" onClick={() => setChoisi(p)}>
                <Icone nom="boite-sortie" taille={22} />
                <span className="ligne__corps">
                  <span className="ligne__titre">{p.nomFr}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
