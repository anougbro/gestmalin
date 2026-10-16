import { useState } from 'react'
import { FournisseurSession } from './etat/session'
import { RAYONS_PAR_DEFAUT } from './etat/rayons'
import { useSession } from './etat/useSession'
import { Icone } from './interface/Icones'
import { EcranAccueil } from './interface/EcranAccueil'
import { EcranReception } from './interface/EcranReception'
import { EcranRanger } from './interface/EcranRanger'
import { EcranSortie } from './interface/EcranSortie'
import { EcranAlertes } from './interface/EcranAlertes'
import { EcranCompter } from './interface/EcranCompter'
import { EcranChercher } from './interface/EcranChercher'
import { EcranProduits } from './interface/EcranProduits'
import { EcranFichiers } from './interface/EcranFichiers'
import './interface/base.css'

/* ============================================================
   LA COQUILLE

   Pas de bibliotheque de navigation : six ecrans, un simple
   etat. Une bibliotheque de routes pour six ecrans serait
   une dependance de plus a maintenir pour rien.
   ============================================================ */

export type Ecran =
  | 'accueil' | 'reception' | 'ranger' | 'sortie'
  | 'alertes' | 'compter' | 'chercher' | 'produits' | 'fichiers'

type Props = {
  ecran: Ecran
  aller: (e: Ecran) => void
  retour: () => void
  contexte: Record<string, unknown>
}

const ECRANS_ECRAN: Record<Ecran, { titre: string; composant: (p: Props) => React.ReactElement }> = {
  accueil: { titre: 'Stock', composant: EcranAccueil },
  reception: { titre: 'Réception', composant: EcranReception },
  ranger: { titre: 'Ranger', composant: EcranRanger },
  sortie: { titre: 'Sortie', composant: EcranSortie },
  alertes: { titre: 'Alertes', composant: EcranAlertes },
  compter: { titre: 'Compter', composant: EcranCompter },
  chercher: { titre: 'Trouver', composant: EcranChercher },
  produits: { titre: 'Produits', composant: EcranProduits },
  fichiers: { titre: 'Fichiers', composant: EcranFichiers },
}

function SelecteurRayon() {
  const { rayon, changeRayon } = useSession()
  const [ouvert, setOuvert] = useState(false)

  if (!ouvert) {
    return (
      <button
        className="seg-item seg--actif"
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 }}
        onClick={() => setOuvert(true)}
      >
        <Icone nom={rayon.ton === 'teal' ? 'capsule' : 'maison'} taille={18} />
        {rayon.nom}
      </button>
    )
  }

  return (
    <div
      style={{ display: 'flex', gap: 4, background: 'var(--c-100)', padding: 4, borderRadius: 'var(--r2)' }}
      role="tablist"
    >
      {RAYONS_PAR_DEFAUT.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={r.id === rayon.id}
          className="seg-item"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            minHeight: 44,
            borderRadius: 'var(--r1)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 650,
            fontFamily: 'inherit',
            color: r.id === rayon.id ? '#fff' : 'var(--c-600)',
            background: r.id === rayon.id
              ? r.ton === 'teal' ? 'var(--teal-700)' : 'var(--amb-700)'
              : 'transparent',
          }}
          onClick={() => { changeRayon(r.id); setOuvert(false) }}
        >
          <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={17} />
          {r.nom}
        </button>
      ))}
    </div>
  )
}

function Coquille() {
  const [pile, setPile] = useState<{ ecran: Ecran; contexte: Record<string, unknown> }[]>([
    { ecran: 'accueil', contexte: {} },
  ])
  const { pret } = useSession()

  const courant = pile[pile.length - 1]
  const definition = ECRANS_ECRAN[courant.ecran]

  const aller = (ecran: Ecran, contexte: Record<string, unknown> = {}) =>
    setPile((p) => [...p, { ecran, contexte }])
  const retour = () => setPile((p) => (p.length > 1 ? p.slice(0, -1) : p))

  if (!pret) {
    return (
      <div className="ecran" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--c-400)' }}>Préparation…</p>
      </div>
    )
  }

  const Composant = definition.composant

  return (
    <div className="app">
      <header className="app__barre">
        <SelecteurRayon />
      </header>

      {courant.ecran !== 'accueil' && (
        <header className="entete">
          <button className="entete__retour" onClick={retour} aria-label="Retour">
            <Icone nom="retour" taille={22} />
          </button>
          <h1 className="entete__titre">{definition.titre}</h1>
        </header>
      )}

      <Composant ecran={courant.ecran} aller={aller} retour={retour} contexte={courant.contexte} />
    </div>
  )
}

export default function App() {
  return (
    <FournisseurSession>
      <Coquille />
    </FournisseurSession>
  )
}
