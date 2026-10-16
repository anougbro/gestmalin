import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base, ATTENTE_ID } from '../donnees/base'
import { quantiteProduit } from '../domaine/stock'
import { Icone, type NomIcone } from './Icones'
import { Tuile } from './Primitives'
import type { Ecran as NomEcran } from '../App'

/* ============================================================
   L'ACCUEIL

   Sur telephone : cinq grosses tuiles, deux par deux. On vise
   avec le pouce, sans lire.

   Sur ordinateur : ce n'est PAS la meme chose avec trois
   colonnes de plus. Un ecran large merite une vraie page —
   un titre, des chiffres, et les gestes en lecture horizontale.
   ============================================================ */

type Gestes = { ecran: NomEcran; icone: NomIcone; label: string; aide: string }

const GESTES: Gestes[] = [
  { ecran: 'chercher', icone: 'loupe', label: 'Trouver', aide: 'Où est un produit' },
  { ecran: 'ranger', icone: 'boite', label: 'Ranger', aide: 'Ce qui attend au quai' },
  { ecran: 'reception', icone: 'boite-entree', label: 'Réception', aide: 'Enregistrer une livraison' },
  { ecran: 'sortie', icone: 'boite-sortie', label: 'Sortie', aide: 'Servir, casser, jeter' },
  { ecran: 'compter', icone: 'compteur', label: 'Compter', aide: 'Inventaire par zone' },
]

export function EcranAccueil({ aller }: { aller: (e: NomEcran, c?: Record<string, unknown>) => void }) {
  const { rayon, compteurs, utilisateur } = useSession()
  const [auQuai, setAuQuai] = useState(0)
  const [references, setReferences] = useState(0)
  const [enStock, setEnStock] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [produits, mouvements] = await Promise.all([
        base.produits.where('rayonId').equals(rayon.id).toArray(),
        base.mouvements.where('rayonId').equals(rayon.id).toArray(),
      ])

      setReferences(produits.length)

      let quantites = 0
      for (const p of produits) quantites += Math.max(0, quantiteProduit(p.id, mouvements))
      setEnStock(quantites)

      /* Ce qui est arrive et n'est pas encore pose : recu au quai
         moins ce qui en est deja reparti. */
      const net = new Map<string, number>()
      for (const m of mouvements) {
        const cle = m.lotId ?? m.produitId
        if (m.versEmplacementId === ATTENTE_ID) net.set(cle, (net.get(cle) ?? 0) + m.quantite)
        if (m.depuisEmplacementId === ATTENTE_ID) net.set(cle, (net.get(cle) ?? 0) - m.quantite)
      }
      setAuQuai([...net.values()].reduce((s, v) => s + Math.max(0, v), 0))
    })()
  }, [rayon, compteurs.total])

  return (
    <div className="ecran">
      <div className="contenu accueil">

        <header className="accueil__tete">
          <div>
            <p className="accueil__sur">{rayon.nom}</p>
            <h1 className="accueil__titre">Bonjour</h1>
          </div>
          <p className="accueil__qui">{utilisateur}</p>
        </header>

        <div className="accueil__stats">
          <div className="stat">
            <span className="stat__valeur num">{references}</span>
            <span className="stat__mot">Références</span>
          </div>
          <div className={compteurs.total > 0 ? 'stat stat--alerte' : 'stat'}>
            <span className="stat__valeur num">{compteurs.total}</span>
            <span className="stat__mot">Alertes</span>
          </div>
          <div className="stat">
            <span className="stat__valeur num">{auQuai}</span>
            <span className="stat__mot">Au quai</span>
          </div>
          <div className="stat">
            <span className="stat__valeur num">{enStock}</span>
            <span className="stat__mot">Unités en stock</span>
          </div>
        </div>

        <div>
          <p className="section__titre">Gestes</p>
          <div className="accueil__gestes">
            {GESTES.map(({ ecran, icone, label, aide }) => (
              <button
                key={ecran}
                className="pos geste"
                onClick={() => aller(ecran)}
              >
                {ecran === 'ranger' && auQuai > 0 && (
                  <span className="pastille num">{auQuai}</span>
                )}
                {ecran === 'accueil' && compteurs.total > 0 && (
                  <span className="pastille num">{compteurs.total}</span>
                )}
                <Icone nom={icone} taille={24} className="geste__icone" />
                <span className="geste__label">{label}</span>
                <span className="geste__aide">{aide}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="section__titre">Gestion</p>
          <div className="grille-2">
            <Tuile icone="capsule" label="Produits" note="Catalogue" ton={rayon.ton} surClick={() => aller('produits')} />
            <Tuile icone="cloche" label="Alertes" note="À traiter" ton={rayon.ton} surClick={() => aller('alertes')} />
          </div>
          <button className="lien-fichier" onClick={() => aller('fichiers')}>
            <Icone nom="export" taille={19} />
            <span>Importer et exporter</span>
          </button>
        </div>
      </div>
    </div>
  )
}