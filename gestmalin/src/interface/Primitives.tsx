import type { ReactNode } from 'react'
import { Icone, type NomIcone } from './Icones'
import { LONGUEUR_CODE, LONGUEUR_TELEPHONE } from '../domaine/acces'

/* ============================================================
   LES PRIMITIVES

   Un seul Bouton, une seule Tuile, un seul Champ dans toute
   l'application. C'est ce qui rend un logiciel coherent.
   ============================================================ */

/* ---------- Bouton ---------- */

type VarianteBouton = 'primaire' | 'secondaire' | 'discret' | 'danger'

export function Bouton({
  children,
  variante = 'primaire',
  icone,
  taille,
  plein,
  surClick,
  disabled,
  type = 'button',
}: {
  children?: ReactNode
  variante?: VarianteBouton
  icone?: NomIcone
  taille?: number
  plein?: boolean
  surClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const classes = ['btn', `btn--${variante}`]
  if (taille && taille >= 64) classes.push('btn--large')
  if (plein) classes.push('btn--plein')

  return (
    <button type={type} className={classes.join(' ')} onClick={surClick} disabled={disabled}>
      {icone && <Icone nom={icone} taille={20} />}
      {children}
    </button>
  )
}

/* ---------- Tuile de l'accueil ---------- */

export function Tuile({
  icone,
  label,
  note,
  pastille,
  ton,
  surClick,
  nomAccessible,
  plein,
}: {
  icone: NomIcone
  label: string
  note?: string
  pastille?: number
  ton?: 'teal' | 'amb'
  surClick: () => void
  nomAccessible?: string
  plein?: boolean
}) {
  const classes = ['tuile', 'pos']
  if (ton) classes.push(`tuile--${ton}`)
  if (plein) classes.push('tuile--plein')

  return (
    <button className={classes.join(' ')} onClick={surClick} aria-label={nomAccessible ?? label}>
      {pastille !== undefined && pastille > 0 && (
        <span className="pastille num">{pastille}</span>
      )}
      <Icone nom={icone} taille={26} className="tuile__icone" />
      <span className="tuile__label">{label}</span>
      {note && <span className="tuile__note num">{note}</span>}
    </button>
  )
}

/* ---------- Badge ---------- */

export function Badge({ children, ton }: { children: ReactNode; ton?: 'dgr' | 'wrn' | 'ok' | 'teal' }) {
  return <span className={ton ? `badge badge--${ton}` : 'badge'}>{children}</span>
}

/* ---------- Champ ---------- */

export function Champ({
  label,
  aide,
  children,
}: {
  label: string
  aide?: string
  children: ReactNode
}) {
  return (
    <label className="champ">
      <span className="champ__label">{label}</span>
      {children}
      {aide && <span className="champ__aide">{aide}</span>}
    </label>
  )
}

/* ---------- Stepper ----------
   Deux gros boutons. Un clavier pour les grandes quantites,
   mais jamais obligatoire : on peut tout faire au doigt. */

export function Stepper({
  valeur,
  surChangement,
  minimum = 0,
  maximum = 9999,
  autoFocus,
}: {
  valeur: number
  surChangement: (n: number) => void
  minimum?: number
  maximum?: number
  autoFocus?: boolean
}) {
  const borner = (n: number) => Math.max(minimum, Math.min(maximum, n))

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => surChangement(borner(valeur - 1))}
        disabled={valeur <= minimum}
        aria-label="Moins"
      >
        <Icone nom="moins" taille={24} />
      </button>

      <input
        className="stepper__valeur"
        type="number"
        inputMode="numeric"
        value={Number.isFinite(valeur) ? valeur : ''}
        min={minimum}
        max={maximum}
        autoFocus={autoFocus}
        onChange={(e) => surChangement(borner(Number(e.target.value)))}
      />

      <button
        type="button"
        className="stepper__btn"
        onClick={() => surChangement(borner(valeur + 1))}
        disabled={valeur >= maximum}
        aria-label="Plus"
      >
        <Icone nom="plus" taille={24} />
      </button>
    </div>
  )
}

/* ---------- En-tete d'ecran ---------- */

export function Entete({
  titre,
  surRetour,
  action,
}: {
  titre: string
  surRetour?: () => void
  action?: ReactNode
}) {
  return (
    <header className="entete">
      {surRetour && (
        <button className="entete__retour" onClick={surRetour} aria-label="Retour">
          <Icone nom="retour" taille={22} />
        </button>
      )}
      <h1 className="entete__titre">{titre}</h1>
      {action}
    </header>
  )
}

/* ---------- Ecran vide : jamais un ecran blanc ---------- */

export function Vide({ titre, note, action }: { titre: string; note?: string; action?: ReactNode }) {
  return (
    <div className="carte" style={{ textAlign: 'center', padding: '32px 20px' }}>
      <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 15 }}>{titre}</p>
      {note && <p style={{ color: 'var(--c-500)', fontSize: 13.5, margin: '0 0 16px' }}>{note}</p>}
      {action}
    </div>
  )
}
/* ============================================================
   LE PAVE DE CODE

   Un pave et un seul, utilise dans toute l'application : a la
   connexion et dans les reglages. Deux paves qui divergent, c'est
   un pave qui ne sait plus effacer.

   Le dernier rang porte « effacer », « 0 », « Entrer » — le meme
   ordre qu'un pave de telephone ou qu'un clavier. Les trois font
   la meme hauteur : une touche qui sort du pave est une touche
   qu'on rate au doigt.
   ============================================================ */

export function PavillonNumerique({
  onChiffre, onEffacer, onValider, peutValider,
  libelleValider = 'Entrer', ton = 'sombre',
}: {
  onChiffre: (c: string) => void
  onEffacer: () => void
  onValider: () => void
  peutValider: boolean
  libelleValider?: string
  /** `sombre` : sur le fond bleu de la connexion.
      `clair`  : dans les reglages, sur fond blanc. */
  ton?: 'sombre' | 'clair'
}) {
  return (
    <div className={`pave pave--${ton}`}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button key={n} className="pave__touche" onClick={() => onChiffre(String(n))}>{n}</button>
      ))}

      <button
        className="pave__touche pave__touche--effacer"
        onClick={onEffacer}
        aria-label="Effacer le dernier chiffre"
      >
        <Icone nom="effacer" taille={24} />
      </button>

      <button className="pave__touche pave__touche--zero" onClick={() => onChiffre('0')} aria-label="Zéro">0</button>

      <button
        className={`pave__entree${peutValider ? ' pave__entree--pret' : ''}`}
        onClick={onValider}
        disabled={!peutValider}
      >
        {libelleValider}
      </button>
    </div>
  )
}

/* ---------- Les pastilles du code saisi ---------- */

export function PastillesCode({ code, sur }: { code: string; sur?: 'sombre' | 'clair' }) {
  /* Le nombre de pastilles suit la longueur reelle du code. Un
     ecran qui en dessine quatre pour un code a cinq chiffres ne
     montre pas a la personne ou elle en est : elle ne sait plus
     combien il lui en reste a taper. */
  const place = Math.max(LONGUEUR_CODE, code.length)

  return (
    <div className={`pastilles${sur === 'clair' ? ' pastilles--clair' : ''}`}>
      {Array.from({ length: place }, (_, i) => (
        <span key={i} className={`pastille-point${code.length > i ? ' pastille-point--plein' : ''}`} />
      ))}
    </div>
  )
}

/* ---------- Le login, chiffre par chiffre ----------

   Dix points ne disent rien : on ne peut pas relire ce qu'on vient
   de taper, et une faute sur un numero ne se voit qu'au refus, une
   fois la porte fermee. Un numero n'est pas un secret — le cacher
   n'apporte rien et coute la seule verification dont on dispose
   avant de valider.

   On affiche donc les chiffres, groupes deux par deux, comme on lit
   un numero de telephone. Les positions encore vides restent en
   pointille : la personne voit combien il lui en reste. */
export function NumeroAffiche({ numero, sur }: { numero: string; sur?: 'sombre' | 'clair' }) {
  const chiffres = numero.slice(0, LONGUEUR_TELEPHONE)
  return (
    <div
      className={`numero-affiche${sur === 'clair' ? ' numero-affiche--clair' : ''}`}
      role="status"
      aria-label={`Login : ${chiffres || 'vide'}`}
    >
      {Array.from({ length: LONGUEUR_TELEPHONE }, (_, i) => (
        <span
          key={i}
          className={`numero-affiche__chiffre${i < chiffres.length ? '' : ' numero-affiche__chiffre--vide'}`}
        >
          {i < chiffres.length ? chiffres[i] : '·'}
        </span>
      ))}
    </div>
  )
}
