/* ============================================================
   LE JEU D'ICONES

   Regles non negociables :
   - grille de 24 x 24
   - trait constant de 1,75
   - extremites et jointures arrondies
   - couleur heritee : currentColor
   - AUCUN emoji, AUCUNE police externe, AUCUNE bibliotheque

   Toutes les icones de l'application viennent d'ici. C'est ce
   qui fait qu'un ensemble a l'air dessine plutot qu'assemble.
   ============================================================ */

export type NomIcone =
  | 'capsule' | 'maison' | 'loupe' | 'boite' | 'boite-entree' | 'boite-sortie'
  | 'compteur' | 'cloche' | 'froid' | 'quarantaine' | 'etiquette' | 'fournisseur'
  | 'grille' | 'import' | 'export' | 'camera' | 'clavier'
  | 'retour' | 'coche' | 'croix' | 'plus' | 'moins' | 'alerte'
  | 'personne' | 'effacer'

/* Le 1,75 sur les trois attributs : c'est ce qui donne
   la meme epaisseur partout, meme sur un autre ecran. */
const COMMUN = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const TRACES: Record<NomIcone, React.ReactNode> = {
  /* --- Les deux rayons --- */
  capsule: (
    <>
      <path d="M9.6 11.1v-.7a1.65 1.65 0 0 1 3.3 0v.7" />
      <path d="M12.9 11.1V6.6a1.65 1.65 0 0 1 3.3 0v5.3a4.5 4.5 0 0 1-4.5 4.5h-1a4.5 4.5 0 0 1-4.5-4.5v-3a1.65 1.65 0 0 1 3.3 0v1.6" />
    </>
  ),
  maison: (
    <>
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M6 9.7V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.7" />
      <path d="M10 20v-5h4v5" />
    </>
  ),

  /* --- Les cinq gestes --- */
  loupe: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 4 4" />
    </>
  ),
  boite: (
    <>
      <path d="M20.5 8.2v7.6a1 1 0 0 1-.55.89l-7 3.6a1 1 0 0 1-.9 0l-7-3.6a1 1 0 0 1-.55-.89V8.2" />
      <path d="m3.7 7.8 7.45-3.83a1 1 0 0 1 .9 0L19.5 7.8l-7.45 3.83a1 1 0 0 1-.9 0Z" />
      <path d="M12 11.6v7.2" />
    </>
  ),
  'boite-entree': (
    <>
      <path d="M20.5 12.6v3.2a1 1 0 0 1-.55.89l-7 3.6a1 1 0 0 1-.9 0l-7-3.6a1 1 0 0 1-.55-.89v-3.2" />
      <path d="m3.7 12.1 7.45-3.83a1 1 0 0 1 .9 0l7.45 3.83-7.45 3.83a1 1 0 0 1-.9 0Z" />
      <path d="M12 9.5V3.4" />
      <path d="m9.2 6.2 2.8-2.8 2.8 2.8" />
    </>
  ),
  'boite-sortie': (
    <>
      <path d="M20.5 12.6v3.2a1 1 0 0 1-.55.89l-7 3.6a1 1 0 0 1-.9 0l-7-3.6a1 1 0 0 1-.55-.89v-3.2" />
      <path d="m3.7 12.1 7.45-3.83a1 1 0 0 1 .9 0l7.45 3.83-7.45 3.83a1 1 0 0 1-.9 0Z" />
      <path d="M12 8.5v6.1" />
      <path d="m9.2 11.8 2.8 2.8 2.8-2.8" />
    </>
  ),
  compteur: (
    <>
      <path d="M4 7h2.6" /><path d="M4 12h2.6" /><path d="M4 17h2.6" />
      <path d="M10.2 7h2.6" /><path d="M10.2 12h2.6" /><path d="M10.2 17h2.6" />
      <path d="M16.4 7H20" /><path d="M16.4 12H20" /><path d="M16.4 17H20" />
    </>
  ),

  /* --- Etats et alertes --- */
  cloche: (
    <>
      <path d="M17.5 10.4a5.5 5.5 0 1 0-11 0c0 5-2 6.4-2 6.4h15s-2-1.4-2-6.4" />
      <path d="M13.8 20a2 2 0 0 1-3.6 0" />
    </>
  ),
  alerte: (
    <>
      <path d="M12 8.6v4.6" />
      <path d="M12 16.6h.01" />
      <path d="M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  quarantaine: (
    <>
      <path d="M12 3.4 4.6 6.2v5.3c0 4.3 3 8.3 7.4 9.5 4.4-1.2 7.4-5.2 7.4-9.5V6.2Z" />
      <path d="M12 8.6v4.4" /><path d="M12 16.4h.01" />
    </>
  ),

  /* --- La personne, et le changement de personne ---
     Un bouton « changer de personne » qui ne montre pas de
     personne se confond avec n'importe quel texte. */
  personne: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5.2 20a6.8 6.8 0 0 1 13.6 0" />
    </>
  ),

  /* --- Effacer un chiffre ---
     La touche retour, telle qu'elle est sur un clavier. Une
     croix seule se confond avec « fermer ». La pointe vers la
     gauche, c'est le geste de revenir en arriere. */
  effacer: (
    <>
      <path d="M9 6.4h9.6a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H9L3.6 12Z" />
      <path d="M12.4 9.6 16.4 13.6M16.4 9.6 12.4 13.6" />
    </>
  ),

  /* --- Lieux --- */
  froid: (
    <>
      <path d="M13.9 13.6V5.4a1.9 1.9 0 0 0-3.8 0v8.2a3.6 3.6 0 1 0 3.8 0Z" />
      <path d="M12 9.4v5.4" />
      <path d="M18.4 6.6h2M17.4 8.8l1.4-1.4" />
    </>
  ),
  etiquette: (
    <>
      <path d="M11.6 3.5H5.1a1.6 1.6 0 0 0-1.6 1.6v6.5c0 .42.17.83.47 1.13l7.8 7.8a1.6 1.6 0 0 0 2.26 0l6.1-6.1a1.6 1.6 0 0 0 0-2.26l-7.8-7.8a1.6 1.6 0 0 0-1.13-.47Z" />
      <path d="M7.6 7.6h.01" />
    </>
  ),
  fournisseur: (
    <>
      <path d="M2.9 6.6h10.6v10.2a1 1 0 0 1-1 1H3.9a1 1 0 0 1-1-1Z" />
      <path d="M13.5 10.2h3.9l2.7 3v3.6a1 1 0 0 1-1 1h-5.6" />
      <circle cx="7" cy="19.4" r="1.6" /><circle cx="17" cy="19.4" r="1.6" />
    </>
  ),

  /* --- Fichiers --- */
  import: (
    <>
      <path d="M12 3.6v10.8" /><path d="m8 10.6 4 4 4-4" />
      <path d="M4.4 16.4v2.4a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-2.4" />
    </>
  ),
  export: (
    <>
      <path d="M12 14.4V3.6" /><path d="m8 7.4 4-4 4 4" />
      <path d="M4.4 16.4v2.4a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-2.4" />
    </>
  ),

  /* --- Divers --- */
  grille: (
    <>
      <path d="M4.4 4.4h6v6h-6z" /><path d="M13.6 4.4h6v6h-6z" />
      <path d="M4.4 13.6h6v6h-6z" /><path d="M13.6 13.6h6v6h-6z" />
    </>
  ),
  camera: (
    <>
      <path d="M3.6 8.6a1.8 1.8 0 0 1 1.8-1.8h1.8l1.4-2.2h6.8l1.4 2.2h1.8a1.8 1.8 0 0 1 1.8 1.8v9a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8Z" />
      <path d="M12 15.6a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
    </>
  ),
  clavier: (
    <>
      <rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2" />
      <path d="M6.4 10h.01M9.8 10h.01M13.2 10h.01M16.6 10h.01M6.4 13.6h.01M9.8 13.6h.01M13.2 13.6h.01M16.6 13.6h.01" />
      <path d="M8.4 16.4h7.2" />
    </>
  ),

  /* --- Actions ---
     Plusieurs tracés dans le meme noeud exigent un fragment.
     Un seul <path> n'en a pas besoin. */
  retour: (
    <>
      <path d="M19 12H5.4" />
      <path d="m11 5.6-5.6 6.4 5.6 6.4" />
    </>
  ),
  coche: <path d="m5.4 12.6 4.6 4.4L18.6 7.4" />,
  croix: (
    <>
      <path d="m6.6 6.6 10.8 10.8" />
      <path d="M17.4 6.6 6.6 17.4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.4v13.2" />
      <path d="M5.4 12h13.2" />
    </>
  ),
  moins: <path d="M5.4 12h13.2" />,
}

type Props = {
  nom: NomIcone
  taille?: number
  className?: string
}

export function Icone({ nom, taille = 24, className }: Props) {
  return (
    <svg
      {...COMMUN}
      width={taille}
      height={taille}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {TRACES[nom]}
    </svg>
  )
}
