import type { ReactNode } from 'react'
import { Icone, type NomIcone } from './Icones'

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
}: {
  icone: NomIcone
  label: string
  note?: string
  pastille?: number
  ton?: 'teal' | 'amb'
  surClick: () => void
}) {
  const classes = ['tuile', 'pos']
  if (ton) classes.push(`tuile--${ton}`)

  return (
    <button className={classes.join(' ')} onClick={surClick}>
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