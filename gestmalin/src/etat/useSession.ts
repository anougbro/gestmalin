import { createContext, useContext } from 'react'
import type { Alerte, CompteursAlertes } from '../domaine/alertes'
import type { Utilisateur } from '../domaine/acces'
import type { RayonTravail } from './rayons'
import type { demarrer } from './preparation'
import type { toutEffacer } from '../donnees/depots'

/* Le contrat de la session, et le moyen de le lire.
   Dans son propre fichier : un .tsx qui exporte autre chose
   qu'un composant casse le rechargement à chaud. */

export type Session = {
  rayon: RayonTravail
  /** Demande un changement de rayon. Renvoie faux si la personne
      ne gere pas ce rayon : le refus n'est pas silencieux, il
      remonte jusqu'a l'ecran. */
  changeRayon: (id: string) => boolean
  /** La personne connectee, ou null tant qu'elle ne l'est pas. */
  utilisateur: Utilisateur | null
  /** Les rayons que CETTE personne peut ouvrir, dans l'ordre.
      Avant la connexion : tous les rayons, parce que l'ecran
      d'accueil doit s'ouvrir sans code. */
  rayonsVisibles: string[]
  connecter: (identifiant: string, code: string, numero?: string) => Promise<{ ok: boolean; raison: string | null }>
  deconnecter: () => void
  alertes: Alerte[]
  compteurs: CompteursAlertes
  /** Demandes d'approbation en attente. Montre sur l'accueil
      combien de decisions attendent la personne. */
  enAttenteValidation: number
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