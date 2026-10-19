import { useEffect, useRef, useState } from 'react'
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
import { EcranRayonDuTelephone } from './interface/EcranRayonDuTelephone'
import { rayonDuTelephone } from './donnees/reglages'
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

/* ---------- Le rayon, en haut sur telephone ----------

   Ce n'est plus un bouton. C'est une etiquette.

   C'etait un selecteur a deux onglets : une seule pression suffisait
   a changer de rayon. Dans une pharmacie, une pression de trop
   pendant une sortie de medicament, c'est servir un produit du
   mauvais rayon. Le stock des deux rayons est compense ensemble et
   l'application ne dit pas lequel on regarde.

   Changer de rayon est un acte, pas un filtre. Il se fait
   volontairement, dans le menu, ou on voit les deux noms l'un sous
   l'autre. Ici, on se contente de dire ou on est — ce qu'on a
   besoin de savoir en permanence. */
function EtiquetteRayon() {
  const { rayon } = useSession()
  return (
    <span className="rayon-etiquette">
      <Icone nom={rayon.ton === 'teal' ? 'capsule' : 'maison'} taille={18} />
      <span className="rayon-etiquette__nom">{rayon.nom}</span>
    </span>
  )
}

/* ---------- Sur telephone : qui est connecte ---------- */

function BoutonQui() {
  const { utilisateur, deconnecter } = useSession()
  if (!utilisateur) return null

  /* Une initiale dans un rond ne veut rien dire : « P » peut
     vouloir dire pharmacie, personne, ou prenom. L'icone personne
     se lit seule. La sortie principale reste le bouton de
     l'accueil, qui porte le nom et le mot « Changer » ; celui-ci
     est le raccourci quand on est au fond d'un ecran. */
  return (
    <button
      className="qui-btn"
      onClick={deconnecter}
      aria-label={`${utilisateur.nom} — changer de personne`}
    >
      <Icone nom="personne" taille={22} />
    </button>
  )
}

/* ---------- La barre laterale, pour l'ordinateur ---------- */

function BarreLaterale({
  courant, aller, surFermeture,
}: {
  courant: Ecran
  aller: (e: Ecran) => void
  /** Appele apres un choix : le tiroir se referme, la barre de
      l'ordinateur reste en place et n'en a rien. */
  surFermeture?: () => void
}) {
  const { compteurs, utilisateur, rayon, changeRayon, rayonsVisibles, deconnecter } = useSession()
  const navRef = useRef<HTMLElement | null>(null)
  const [defile, setDefile] = useState(false)

  /* Sur un ecran de 900 px de haut, la liste est plus haute que la
     fenetre. Coupee net, elle passe pour une erreur d'affichage :
     on ne sait pas s'il manque des entrees ou si l'ecran est casse.

     L'indice n'apparait QUE si la liste deborde reellement —
     sinon un degrade qui ne degrade rien, c'est du bruit. */
  useEffect(() => {
    const el = navRef.current
    if (!el) return

    const mesurer = () => setDefile(el.scrollHeight - el.clientHeight > 4)
    mesurer()

    /* ResizeObserver : la hauteur change quand on tourne le
       telephone ou qu'on ouvre le clavier. */
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    for (const e of Array.from(el.children)) ro.observe(e)

    return () => ro.disconnect()
  }, [utilisateur, compteurs.total])

  const lien = (liste: typeof GESTES) =>
    liste.map(({ ecran, icone, label }) => (
      <button
        key={ecran}
        className={`nav-item${courant === ecran ? ' nav-item--actif' : ''}`}
        onClick={() => { aller(ecran); surFermeture?.() }}
        aria-current={courant === ecran ? 'page' : undefined}
      >
        <Icone nom={icone} taille={19} />
        <span>{label}</span>
        {ecran === 'alertes' && compteurs.total > 0 && (
          <span className="nav-item__pastille num">{compteurs.total}</span>
        )}
      </button>
    ))

  /* Les rayons que cette personne peut ouvrir, dans l'ordre de
     la liste de reference. Une seule entree : ce sont eux qu'on
     propose, dans cet ordre. */
  const siens = RAYONS_PAR_DEFAUT.filter((r) => rayonsVisibles.includes(r.id))

  return (
    <aside className="barre">
      <div className="barre__marque">
        <Icone nom="capsule" taille={22} />
        <span>Gestmalin</span>
      </div>

      {/* Le choix du rayon n'a de sens que s'il y a un choix.

          Une personne qui ne gere qu'un seul rayon n'a rien a
          choisir : une pastille qui ne change rien est un bouton
          qui ne marche pas, et elle finit par croire que
          l'application est en panne. On montre alors le rayon,
          sans lui donner l'air d'etre un bouton — exactement
          comme le rayon dans la barre du haut.

          Et on ne montre QUE ses rayons. Afficher un rayon
          interdit apprend a la personne qu'il existe, ce qui ne
          lui sert a rien et l'oblige a se demander pourquoi elle
          n'y a pas acces. */}
      <div className="barre__rayon">
        <p className="barre__titre">Rayon</p>
        {siens.length > 1 ? (
          <div className="seg seg--vertical" role="tablist">
            {siens.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === rayon.id}
                className={`seg-item${r.id === rayon.id ? ' seg-item--actif' : ''}`}
                data-ton={r.ton}
                onClick={() => { changeRayon(r.id); surFermeture?.() }}
              >
                <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={17} />
                {r.nom}
              </button>
            ))}
          </div>
        ) : (
          <div className="seg seg--vertical">
            <div className="seg-item seg-item--actif" aria-current="true">
              <Icone nom={rayon.ton === 'teal' ? 'capsule' : 'maison'} taille={17} />
              {rayon.nom}
            </div>
          </div>
        )}
      </div>

      <nav className={`barre__nav${defile ? ' barre__nav--defile' : ''}`} ref={navRef}>
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
          <Icone nom="personne" taille={18} />
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
  const [tiroir, setTiroir] = useState(false)
  const { pret, utilisateur } = useSession()
  const [rayonRattache, setRayonRattache] = useState(false)

  /* Tant que la base n'est pas prete, on ne peut pas savoir si ce
     telephone a deja ete rattache. Une fois la base lue, on pose
     la question — et plus jamais. */
  useEffect(() => {
    if (!pret) return
    let annule = false
    void (async () => {
      const r = await rayonDuTelephone()
      if (!annule) setRayonRattache(r !== null)
    })()
    return () => { annule = true }
  }, [pret])

  const courant = pile[pile.length - 1]
  const definition = ECRANS_ECRAN[courant.ecran]

  const aller = (ecran: Ecran, contexte: Record<string, unknown> = {}) =>
    setPile((p) => [...p, { ecran, contexte }])
  const retour = () => setPile((p) => (p.length > 1 ? p.slice(0, -1) : p))

  /* Echap ferme le tiroir : sur ordinateur, on ne ferme pas une
     barre laterale en pressant une touche, mais sur telephone
     c'est le geste attendu. Fermer sans sauver son travail est
     le pire defaut d'un tiroir. */
  useEffect(() => {
    if (!tiroir) return
    const surEchap = (e: KeyboardEvent) => { if (e.key === 'Escape') setTiroir(false) }
    window.addEventListener('keydown', surEchap)
    return () => window.removeEventListener('keydown', surEchap)
  }, [tiroir])

  /* On ne defile plus derriere le tiroir : sans cela, le doigt
     qui descend sur la liste fait remonter la page en meme
     temps, et on perd l'ecran qu'on voulait. */
  useEffect(() => {
    document.body.style.overflow = tiroir ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [tiroir])

  if (!pret) {
    return (
      <div className="ecran ecran--attente">
        <p style={{ color: 'var(--c-400)' }}>Préparation…</p>
      </div>
    )
  }

  /* La toute premiere question, posee une fois par telephone.

     Elle vient AVANT le code : demander un code a quelqu'un dont
     on ne sait pas encore sur quoi il travaille ne sert a rien. Et
     elle ne se pose qu'une fois — la reponse est ecrite en base. */
  if (!rayonRattache) return <EcranRayonDuTelephone surChoix={() => setRayonRattache(true)} />

  /* On entre par un code, pas par un mot de passe : quatre
     chiffres, tapes d'une seule main, avec des gants. */
  if (!utilisateur) return <EcranConnexion />

  const Composant = definition.composant

  return (
    <div className="app">
      <BarreLaterale courant={courant.ecran} aller={aller} />

      {/* Le tiroir n'existe qu'au telephone. Sur ordinateur la
          barre laterale est deja la, et deux menus pour la meme
          liste ne servent a rien. */}
      {tiroir && (
        <div className="tiroir">
          <button
            className="tiroir__voile"
            onClick={() => setTiroir(false)}
            aria-label="Fermer le menu"
          />
          <div className="tiroir__panneau">
            <BarreLaterale courant={courant.ecran} aller={aller} surFermeture={() => setTiroir(false)} />
          </div>
        </div>
      )}

      <div className="app__colonne">
        <header className="app__barre">
          <button
            className="menu-btn"
            onClick={() => setTiroir((v) => !v)}
            aria-label="Ouvrir le menu"
            aria-expanded={tiroir}
          >
            <Icone nom="grille" taille={22} />
          </button>
          <EtiquetteRayon />
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