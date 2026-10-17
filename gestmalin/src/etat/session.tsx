import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { base } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { calculerAlertes, compterAlertes, type Alerte } from '../domaine/alertes'
import { aujourdhui } from '../domaine/temps'
import { maintenantISO } from '../domaine/temps'
import { connecter as verifierCode, type Utilisateur } from '../domaine/acces'
import type { Mouvement } from '../domaine/types'
import { Contexte, type Session } from './useSession'
import { RAYONS_PAR_DEFAUT, type RayonTravail } from './rayons'
import { dejaPreparee, demarrer } from './preparation'

/* ============================================================
   L'ETAT DE L'APPLICATION

   UN SEUR endroit qui sait quel rayon on regarde, QUI ON EST, et
   ce qui se passe a l'ecran.

   Les ecrans ne parlent JAMAIS directement a la base :
   ils passent par ici. C'est ce qui evite d'avoir deux endroits
   qui donnent deux versions differentes de la meme reponse.
   ============================================================ */

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [rayon, setRayon] = useState<RayonTravail>(RAYONS_PAR_DEFAUT[0])
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [pret, setPret] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     Charger une base IndexedDB EST une synchronisation avec un
     systeme externe. Le setState arrive dans la promesse, donc
     apres le rendu : il n'y a pas de cascade. */
  async function rafraichir() {
    const [produits, lots, mouvements, emplacements, zones] = await Promise.all([
      base.produits.where('rayonId').equals(rayon.id).toArray(),
      base.lots.toArray(),
      base.mouvements.where('rayonId').equals(rayon.id).toArray() as Promise<Mouvement[]>,
      base.emplacements.toArray(),
      base.zones.toArray(),
    ])

    const zonesQuarantaine = zones
      .filter((z) => z.rayonId === rayon.id && z.type === 'quarantaine')
      .map((z) => z.id)

    setAlertes(
      calculerAlertes({
        produits,
        lots: lots.filter((l) => produits.some((p) => p.id === l.produitId)),
        mouvements,
        emplacementsQuarantaine: emplacements
          .filter((e) => zonesQuarantaine.includes(e.zoneId))
          .map((e) => e.id),
        reference: aujourdhui(),
      }),
    )
  }

  /* La connexion est verifiee SUR PLACE, sans reseau : la base
     contient les empreintes, et le code saisi est compare a
     celle de la personne. */
  async function connecter(identifiant: string, code: string) {
    const tous = await base.utilisateurs.toArray()
    const r = verifierCode(tous, identifiant, code, rayon.id)
    if (r.ok) setUtilisateur(r.utilisateur)
    return r.ok
      ? { ok: true }
      : { ok: false, message: r.raison === 'rayon-refuse' ? "Vous n'avez pas accès à ce rayon." : 'Code incorrect.' }
  }

  useEffect(() => {
    ;(async () => {
      if (!(await dejaPreparee())) await demarrer()
      setPret(true)
    })()
  }, [])

  useEffect(() => {
    if (pret) void rafraichir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayon, pret, maintenantISO().slice(0, 10)])

  const valeur = useMemo<Session>(
    () => ({
      rayon,
      changeRayon: (id: string) =>
        setRayon(RAYONS_PAR_DEFAUT.find((r) => r.id === id) ?? RAYONS_PAR_DEFAUT[0]),
      utilisateur,
      connecter,
      deconnecter: () => setUtilisateur(null),
      alertes,
      compteurs: compterAlertes(alertes),
      rafraichir,
      pret,
      toutEffacer,
      demarrer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rayon, alertes, pret, utilisateur],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}