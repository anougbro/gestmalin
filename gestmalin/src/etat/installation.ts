import { useEffect, useState } from 'react'

/* ============================================================
   L'INSTALLATION SUR LE TELEPHONE

   Une PWA s'installe depuis le navigateur, mais rien ne le dit a
   l'ecran. Sans ce bloc, la personne utilise l'application dans un
   onglet, ferme l'onglet, et croit qu'il faut retaper l'adresse
   chaque fois. Le stock, lui, ne bouge pas — mais l'habitude ne
   se prend pas.

   Deux cas, et deux seulement :
   - le navigateur propose l'installation : on garde l'evenement
     pour l'offrir au bon moment (un bouton, pas une banniere qui
     surgit) ;
   - il ne le propose pas : on dit ou est le menu, en une ligne.

   L'evenement `beforeinstallprompt` n'est pas standard : il
   n'existe pas dans les types du DOM, d'ou la forme minimale
   ci-dessous. Sur un navigateur qui ne le connait pas, rien ne
   casse : `proposee` reste faux et la carte explique le menu.
   ============================================================ */

type InviteInstallation = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type EtatInstallation = {
  /** Le bouton « Installer » a-t-il un sens maintenant ? */
  proposee: boolean
  /** L'application tourne-t-elle deja comme une application ? */
  installee: boolean
  /** Ouvre l'invite du navigateur. Sans invite, ne fait rien. */
  installer: () => Promise<void>
}

function dejaInstallee(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function useInstallation(): EtatInstallation {
  const [invite, setInvite] = useState<InviteInstallation | null>(null)
  const [installee, setInstallee] = useState(dejaInstallee)

  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)')

    function surInvite(e: Event) {
      /* Chrome n'affiche sa propre banniere que si on l'empeche.
         On la garde pour la poser dans les reglages, la ou on la
         cherche quand on en a besoin. */
      e.preventDefault()
      setInvite(e as InviteInstallation)
    }

    function surInstallation() {
      setInstallee(true)
      setInvite(null)
    }

    function surMode() {
      setInstallee(media?.matches === true)
    }

    window.addEventListener('beforeinstallprompt', surInvite)
    window.addEventListener('appinstalled', surInstallation)
    media?.addEventListener('change', surMode)

    return () => {
      window.removeEventListener('beforeinstallprompt', surInvite)
      window.removeEventListener('appinstalled', surInstallation)
      media?.removeEventListener('change', surMode)
    }
  }, [])

  async function installer() {
    if (!invite) return
    await invite.prompt()
    const choix = await invite.userChoice
    if (choix.outcome === 'accepted') {
      setInstallee(true)
      setInvite(null)
    }
  }

  return { proposee: invite !== null && !installee, installee, installer }
}
