import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { Icone } from './Icones'
import { Tuile } from './Primitives'
import { base, ATTENTE_ID } from '../donnees/base'
import type { Ecran as NomEcran } from '../App'

/* ============================================================
   L'ACCUEIL — cinq gestes, rien d'autre.

   Aucun menu, aucun sous-menu. On ouvre l'application,
   on voit ce qu'on peut faire.
   ============================================================ */

export function EcranAccueil({ aller }: { aller: (e: NomEcran, c?: Record<string, unknown>) => void }) {
  const { rayon, compteurs, utilisateur } = useSession()
  const [aRanger, setARanger] = useState(0)
  const [enStock, setEnStock] = useState(0)

  useEffect(() => {
    ;(async () => {
      /* Ce qui traine au quai de reception : recu, pas encore pose. */
      const attente = await base.emplacements.get(ATTENTE_ID)
      const mouvements = await base.mouvements.where('rayonId').equals(rayon.id).toArray()

      let range = 0
      if (attente) {
        const dansAttente = new Map<string, number>()
        for (const m of mouvements) {
          if (m.versEmplacementId === ATTENTE_ID) dansAttente.set(m.lotId ?? m.produitId, (dansAttente.get(m.lotId ?? m.produitId) ?? 0) + m.quantite)
          if (m.depuisEmplacementId === ATTENTE_ID) dansAttente.set(m.lotId ?? m.produitId, (dansAttente.get(m.lotId ?? m.produitId) ?? 0) - m.quantite)
        }
        range = [...dansAttente.values()].reduce((s, v) => s + Math.max(0, v), 0)
      }

      setARanger(range)
      const produits = await base.produits.where('rayonId').equals(rayon.id).toArray()
      setEnStock(produits.length)
    })()
  }, [rayon, compteurs.total])

  return (
    <main className="ecran">
      <div className="contenu">
        <div className="entre" style={{ padding: '4px 2px 0' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-500)' }}>{utilisateur}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
              <span className="num">{enStock}</span> références
            </p>
          </div>
        </div>

        {compteurs.total > 0 ? (
          <button
            className="bandeau"
            onClick={() => aller('alertes')}
          >
            <span className="bandeau__compte num">{compteurs.agir}</span>
            <span className="bandeau__texte">
              <span className="bandeau__titre">À traiter</span>
              <span className="bandeau__note">
                {compteurs.agir === 0 ? 'Rien d\'urgent' : `${compteurs.surveiller} à surveiller`}
              </span>
            </span>
            <Icone nom="cloche" taille={22} />
          </button>
        ) : (
          <div className="bandeau bandeau--neutre">
            <span className="bandeau__texte">
              <span className="bandeau__titre">Tout est bon</span>
              <span className="bandeau__note">Aucune alerte</span>
            </span>
            <Icone nom="coche" taille={22} />
          </div>
        )}

        <div className="grille-tuiles">
          <Tuile icone="loupe" label="Trouver" ton={rayon.ton} surClick={() => aller('chercher')} />
          <Tuile icone="boite" label="Ranger" ton={rayon.ton} pastille={aRanger} surClick={() => aller('ranger')} />
          <Tuile icone="boite-entree" label="Réception" ton={rayon.ton} surClick={() => aller('reception')} />
          <Tuile icone="boite-sortie" label="Sortie" ton={rayon.ton} surClick={() => aller('sortie')} />
        </div>

        <Tuile icone="compteur" label="Compter" ton={rayon.ton} surClick={() => aller('compter')} />

        <div className="grille-2" style={{ marginTop: 4 }}>
          <Tuile icone="grille" label="Produits" ton={rayon.ton} surClick={() => aller('produits')} />
          <Tuile icone="alerte" label="Alertes" ton={rayon.ton} pastille={compteurs.total} surClick={() => aller('alertes')} />
        </div>
      </div>
    </main>
  )
}
