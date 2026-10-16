import { createContext, useContext } from 'react'
import type { Alerte, CompteursAlertes } from '../domaine/alertes'
import type { RayonTravail } from './rayons'
import type { demarrer, toutEffacer } from './session'

/* Le contrat de la session, et le moyen de le lire.
   Dans son propre fichier : un .tsx qui exporte autre chose
   qu'un composant casse le rechargement à chaud. */

export type Session = {
  rayon: RayonTravail
  changeRayon: (id: string) => void
  utilisateur: string
  alertes: Alerte[]
  compteurs: CompteursAlertes
  rafraichir: () => Promise<void>
  pret: boolean
  toutEffacer: typeof toutEffacer
  demarrer: typeof demarrer
}

export const Contexte = createContext<Session | null>(null)

export function useSession(): Session {
  const s = useContext(Contexte)
  if (!s) throw new Error('useSession doit être utilisé dans <FournisseurSession>.')
  return s
}