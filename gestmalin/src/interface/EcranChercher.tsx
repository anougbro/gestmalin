import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { stockDe } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Entete, Vide } from './Primitives'

/* ============================================================
   TROUVER — où est ce produit, et combien il en reste
   ============================================================ */

export function EcranChercher({ retour }: { retour: () => void }) {
  const { rayon } = useSession()
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<ProduitRow[]>([])
  const [stocks, setStocks] = useState<Record<string, number>>({})
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    let vivant = true
    ;(async () => {
      const q = texte.trim().toLowerCase()
      const tous = await base.produits.where('rayonId').equals(rayon.id).toArray()
      const vus = tous
        .filter((p) => !q || p.nomFr.toLowerCase().includes(q) || (p.codeBarres ?? '').includes(q))
        .sort((a, b) => a.nomFr.localeCompare(b.nomFr))
        .slice(0, 40)
      if (!vivant) return
      setResultats(vus)

      const emplacements = await base.emplacements.toArray()
      const parId = new Map(emplacements.map((e) => [e.id, e.code]))
      const nouveauxStocks: Record<string, number> = {}
      const nouveauxCodes: Record<string, string> = {}
      for (const p of vus) {
        nouveauxStocks[p.id] = await stockDe(p.id)
        if (p.emplacementId) nouveauxCodes[p.id] = parId.get(p.emplacementId) ?? ''
      }
      if (vivant) { setStocks(nouveauxStocks); setCodes(nouveauxCodes) }
    })()
    return () => { vivant = false }
  }, [texte, rayon])

  return (
    <div className="ecran">
      <Entete titre="Trouver" surRetour={retour} />

      <div className="contenu">
        <input
          className="champ__saisie"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Nom ou code-barres…"
          autoFocus
        />

        {resultats.length === 0 ? (
          <Vide titre="Aucun produit" note="Ce rayon ne contient rien de ce nom." />
        ) : (
          <div className="liste">
            {resultats.map((p) => {
              const stock = stocks[p.id] ?? 0
              const bas = stock <= p.seuil
              return (
                <div key={p.id} className="ligne" style={{ cursor: 'default' }}>
                  <span className="ligne__corps">
                    <span className="ligne__titre">{p.nomFr}</span>
                    <span className="ligne__note">
                      {p.unite} · seuil <span className="num">{p.seuil}</span>
                    </span>
                  </span>
                  <span className="entre" style={{ gap: 10 }}>
                    <span
                      className="num"
                      style={{
                        fontSize: 20, fontWeight: 700,
                        color: bas ? 'var(--dgr-700)' : 'var(--c-800)',
                      }}
                    >
                      {stock}
                    </span>
                    {codes[p.id] && <span className="destination">{codes[p.id]}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
