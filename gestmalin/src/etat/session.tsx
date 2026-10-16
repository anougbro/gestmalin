import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { base } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { calculerAlertes, compterAlertes, type Alerte } from '../domaine/alertes'
import { aujourdhui } from '../domaine/temps'
import type { Mouvement } from '../domaine/types'
import { Contexte, type Session } from './useSession'
import { RAYONS_PAR_DEFAUT, type RayonTravail } from './rayons'
import { dejaPreparee, demarrer } from './preparation'

/* ============================================================
   L'ETAT DE L'APPLICATION

   UN SEUR endroit qui sait quel rayon on regarde, qui on est,
   et ce qui se passe a l'ecran.

   Les ecrans ne parlent JAMAIS directement a la base :
   ils passent par ici. C'est ce qui evite d'avoir deux endroits
   qui donnent deux versions differentes de la meme reponse.
   ============================================================ */

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [rayon, setRayon] = useState<RayonTravail>(RAYONS_PAR_DEFAUT[0])
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [pret, setPret] = useState(false)
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

  useEffect(() => {
    ;(async () => {
      if (!(await dejaPreparee())) await demarrer()
      setPret(true)
    })()
  }, [])

  useEffect(() => {
    if (pret) void rafraichir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayon, pret])

  const valeur = useMemo<Session>(
    () => ({
      rayon,
      changeRayon: (id: string) =>
        setRayon(RAYONS_PAR_DEFAUT.find((r) => r.id === id) ?? RAYONS_PAR_DEFAUT[0]),
      utilisateur: 'Préparateur',
      alertes,
      compteurs: compterAlertes(alertes),
      rafraichir,
      pret,
      toutEffacer,
      demarrer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rayon, alertes, pret],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}