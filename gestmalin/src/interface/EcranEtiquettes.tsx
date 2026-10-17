import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { Bouton, Entete, Vide } from './Primitives'

/* ============================================================
   LES ETIQUETTES D'EMPLACEMENT

   Le code « A2-04 » doit exister EN PHYSIQUE, sur l'etagere.
   Sans ca, l'application dit une chose et la pharmacie en dit
   une autre — et personne ne sait laquelle est vraie.

   On imprime donc une planche : une etiquette par emplacement,
   avec son code et sa zone. La feuille sort sur l'imprimante
   ordinaire, on colle, on range.
   ============================================================ */

type Etiquette = { code: string; zone: string; rayon: string }

export function EcranEtiquettes({ retour }: { retour: () => void }) {
  const { rayon } = useSession()
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([])
  const [charge, setCharge] = useState(true)

  useEffect(() => {
    void (async () => {
      const [zones, emplacements] = await Promise.all([
        base.zones.where('rayonId').equals(rayon.id).toArray(),
        base.emplacements.toArray(),
      ])
      const nomZone = new Map(zones.map((z) => [z.id, z.nom]))

      setEtiquettes(
        emplacements
          .filter((e) => e.zoneId && nomZone.has(e.zoneId))
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((e) => ({ code: e.code, zone: nomZone.get(e.zoneId) ?? '', rayon: rayon.nom })),
      )
      setCharge(false)
    })()
  }, [rayon])

  return (
    <div className="ecran">
      <Entete titre="Étiquettes" surRetour={retour} />

      <div className="contenu">
        {charge ? null : etiquettes.length === 0 ? (
          <Vide titre="Aucun emplacement" note="Ajoute des zones pour voir apparaître les étiquettes." />
        ) : (
          <>
            <div className="carte">
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-700)' }}>
                {etiquettes.length} étiquettes dans le rayon {rayon.nom}.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--c-500)' }}>
                Le code doit exister sur l'étagère. Sans ça, l'application et la pharmacie ne
                parlent pas de la même chose.
              </p>
            </div>

            <div className="planche">
              {etiquettes.map((e) => (
                <div key={e.code} className="etiquette">
                  <span className="etiquette__code">{e.code}</span>
                  <span className="etiquette__zone">{e.zone}</span>
                  <span className="etiquette__rayon">{e.rayon}</span>
                </div>
              ))}
            </div>

            <Bouton taille={64} plein surClick={() => window.print()}>Imprimer la planche</Bouton>
          </>
        )}
      </div>
    </div>
  )
}