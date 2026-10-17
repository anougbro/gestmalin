import { useState } from 'react'
import { FournisseurSession } from './etat/session'
import { RAYONS_PAR_DEFAUT } from './etat/rayons'
import { useSession } from './etat/useSession'
import { Icone, type NomIcone } from './interface/Icones'
import { EcranAccueil } from './interface/EcranAccueil'
import { EcranReception } from './interface/EcranReception'
import { EcranRanger } from './interface/EcranRanger'
import { EcranSortie } from './interface/EcranSortie'
import { EcranAlertes } from './interface/EcranAlertes'
import { EcranCompter } from './interface/EcranCompter'
import { EcranChercher } from './interface/EcranChercher'
import { EcranProduits } from './interface/EcranProduits'
import { EcranFichiers } from './interface/EcranFichiers'
import { EcranFroid } from './interface/EcranFroid'
import { EcranReappro } from './interface/EcranReappro'
import { EcranValidation } from './interface/EcranValidation'
import { EcranEtiquettes } from './interface/EcranEtiquettes'
import { EcranConnexion } from './interface/EcranConnexion'
import { EcranReglages } from './interface/EcranReglages'
import './interface/base.css'

/* ============================================================
   LA COQUILLE

   Pas de bibliotheque de navigation : neuf ecrans, un simple
   etat. Une bibliotheque de routes pour neuf ecrans serait
   une dependance de plus a maintenir pour rien.

   La meme coquille sert le telephone ET l'ordinateur :
   - en dessous de 900 px : une colonne, comme sur mobile
   - au-dessus : une vraie barre laterale a gauche
   ============================================================ */

export type Ecran =
  | 'accueil' | 'reception' | 'ranger' | 'sortie'
  | 'alertes' | 'compter' | 'chercher' | 'produits' | 'fichiers'
  | 'froid' | 'commander' | 'valider' | 'etiquettes' | 'reglages'

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
  froid: { titre: 'Réserve froide', composant: EcranFroid },
  commander: { titre: 'Commande', composant: EcranReappro },
  valider: { titre: 'À valider', composant: EcranValidation as unknown as (p: Props) => React.ReactElement },
  etiquettes: { titre: 'Étiquettes', composant: EcranEtiquettes },
  reglages: { titre: 'Réglages', composant: EcranReglages },
}

/* Les cinq gestes, dans l'ordre de la journee. */
const GESTES: { ecran: Ecran; icone: NomIcone; label: string }[] = [
  { ecran: 'accueil', icone: 'grille', label: 'Accueil' },
  { ecran: 'chercher', icone: 'loupe', label: 'Trouver' },
  { ecran: 'reception', icone: 'boite-entree', label: 'Réception' },
  { ecran: 'ranger', icone: 'boite', label: 'Ranger' },
  { ecran: 'sortie', icone: 'boite-sortie', label: 'Sortie' },
  { ecran: 'compter', icone: 'compteur', label: 'Compter' },
]

const PLUS_TARD: { ecran: Ecran; icone: NomIcone; label: string }[] = [
  { ecran: 'alertes', icone: 'cloche', label: 'Alertes' },
  { ecran: 'valider', icone: 'quarantaine', label: 'À valider' },
  { ecran: 'commander', icone: 'fournisseur', label: 'Commander' },
  { ecran: 'froid', icone: 'froid', label: 'Réserve froide' },
  { ecran: 'etiquettes', icone: 'etiquette', label: 'Étiquettes' },
  { ecran: 'produits', icone: 'capsule', label: 'Produits' },
  { ecran: 'fichiers', icone: 'export', label: 'Fichiers' },
  { ecran: 'reglages', icone: 'grille', label: 'Réglages' },
]

/* ---------- Le selecteur de rayon ---------- */

function SelecteurRayon() {
  const { rayon, changeRayon } = useSession()
  const [ouvert, setOuvert] = useState(false)

  if (!ouvert) {
    return (
      <button className="seg-item seg--actif" onClick={() => setOuvert(true)}>
        <Icone nom={rayon.ton === 'teal' ? 'capsule' : 'maison'} taille={18} />
        {rayon.nom}
      </button>
    )
  }

  return (
    <div className="seg" role="tablist">
      {RAYONS_PAR_DEFAUT.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={r.id === rayon.id}
          className={`seg-item${r.id === rayon.id ? ' seg-item--actif' : ''}`}
          data-ton={r.ton}
          onClick={() => { changeRayon(r.id); setOuvert(false) }}
        >
          <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={17} />
          {r.nom}
        </button>
      ))}
    </div>
  )
}

/* ---------- Sur telephone : qui est connecte ---------- */

function BoutonQui() {
  const { utilisateur, deconnecter } = useSession()
  if (!utilisateur) return null

  /* L'initiale seule : sur une petite barre, il n'y a pas la
     place pour un nom. Mais il faut une cible large — 44 px
     minimum, une seule main, souvent avec des gants. */
  return (
    <button
      className="qui-btn"
      onClick={deconnecter}
      aria-label={`${utilisateur.nom} — changer de personne`}
    >
      <span aria-hidden="true">{utilisateur.nom.slice(0, 1).toUpperCase()}</span>
    </button>
  )
}

/* ---------- La barre laterale, pour l'ordinateur ---------- */

function BarreLaterale({ courant, aller }: { courant: Ecran; aller: (e: Ecran) => void }) {
  const { compteurs, utilisateur, rayon, changeRayon, deconnecter } = useSession()

  const lien = (liste: typeof GESTES) =>
    liste.map(({ ecran, icone, label }) => (
      <button
        key={ecran}
        className={`nav-item${courant === ecran ? ' nav-item--actif' : ''}`}
        onClick={() => aller(ecran)}
        aria-current={courant === ecran ? 'page' : undefined}
      >
        <Icone nom={icone} taille={19} />
        <span>{label}</span>
        {ecran === 'alertes' && compteurs.total > 0 && (
          <span className="nav-item__pastille num">{compteurs.total}</span>
        )}
      </button>
    ))

  return (
    <aside className="barre">
      <div className="barre__marque">
        <Icone nom="capsule" taille={22} />
        <span>Gestmalin</span>
      </div>

      <div className="barre__rayon">
        <p className="barre__titre">Rayon</p>
        <div className="seg seg--vertical" role="tablist">
          {RAYONS_PAR_DEFAUT.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === rayon.id}
              className={`seg-item${r.id === rayon.id ? ' seg-item--actif' : ''}`}
              data-ton={r.ton}
              onClick={() => changeRayon(r.id)}
            >
              <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={17} />
              {r.nom}
            </button>
          ))}
        </div>
      </div>

      <nav className="barre__nav">
        <p className="barre__titre">Gestes</p>
        {lien(GESTES)}
        <p className="barre__titre barre__titre--espace">Gestion</p>
        {lien(PLUS_TARD)}
      </nav>

      <div className="barre__pied">
        {/* Le nom seul n'est pas une sortie : il faut un bouton.
            Sans lui, on ne peut pas changer de personne sans
            vider toute la base. */}
        <button className="qui" onClick={deconnecter}>
          <span className="qui__nom">{utilisateur?.nom ?? '—'}</span>
          <span className="qui__role">Changer</span>
        </button>
      </div>
    </aside>
  )
}

/* ---------- La coquille ---------- */

function Coquille() {
  const [pile, setPile] = useState<{ ecran: Ecran; contexte: Record<string, unknown> }[]>([
    { ecran: 'accueil', contexte: {} },
  ])
  const { pret, utilisateur } = useSession()

  const courant = pile[pile.length - 1]
  const definition = ECRANS_ECRAN[courant.ecran]

  const aller = (ecran: Ecran, contexte: Record<string, unknown> = {}) =>
    setPile((p) => [...p, { ecran, contexte }])
  const retour = () => setPile((p) => (p.length > 1 ? p.slice(0, -1) : p))

  if (!pret) {
    return (
      <div className="ecran ecran--attente">
        <p style={{ color: 'var(--c-400)' }}>Préparation…</p>
      </div>
    )
  }

  /* On entre par un code, pas par un mot de passe : quatre
     chiffres, tapes d'une seule main, avec des gants. */
  if (!utilisateur) return <EcranConnexion />

  const Composant = definition.composant

  return (
    <div className="app">
      <BarreLaterale courant={courant.ecran} aller={aller} />

      <div className="app__colonne">
        <header className="app__barre">
          <SelecteurRayon />
          <BoutonQui />
        </header>

        {/* Pas d'en-tete ici : chaque ecran possede le sien.
            Il doit le posseder, parce que le titre change en cours
            de route — la Reception affiche le nom du produit qu'on
            scanne, pas « Réception ». Un en-tete dans la coquille
            afficherait donc deux fois le même titre, et le mauvais. */}

        <Composant ecran={courant.ecran} aller={aller} retour={retour} contexte={courant.contexte} />
      </div>
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