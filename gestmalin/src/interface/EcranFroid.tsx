import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { releves, zones } from '../donnees/depots'
import { etatFroid, decrireEtat, PLAGE_MIN, PLAGE_MAX, type EtatFroid } from '../domaine/froid'
import { maintenantISO } from '../domaine/temps'
import type { ReleveTemperature } from '../domaine/types'
import { Icone } from './Icones'
import { Bouton, Entete, Stepper, Vide } from './Primitives'

/* ============================================================
   LA RESERVE FROIDE

   Un releve matin et soir. C'est court : deux chiffres, un
   bouton. Il faut pouvoir le faire en dix secondes, en passant.
   ============================================================ */

export function EcranFroid({ retour }: { retour: () => void }) {
  const { rayon } = useSession()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [liste, setListe] = useState<ReleveTemperature[]>([])
  const [etat, setEtat] = useState<EtatFroid | null>(null)
  const [valeur, setValeur] = useState(5)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    void (async () => {
      const froides = await zones.froides()
      const laZone = froides.find((z) => z.rayonId === rayon.id)
      if (!laZone) { setZoneId(null); return }
      setZoneId(laZone.id)
      const r = await releves.deLaZone(laZone.id)
      setListe(r)
      setEtat(etatFroid(r, laZone.id, maintenantISO()))
    })()
  }, [rayon])

  async function relever() {
    if (!zoneId) return
    await releves.ajouter(zoneId, valeur)
    const r = await releves.deLaZone(zoneId)
    setListe(r)
    setEtat(etatFroid(r, zoneId, maintenantISO()))
    setEnregistre(true)
    setTimeout(() => setEnregistre(false), 2500)
  }

  if (!zoneId) {
    return (
      <div className="ecran">
        <Entete titre="Réserve froide" surRetour={retour} />
        <div className="contenu">
          <Vide
            titre="Aucune réserve froide"
            note="Ajoute une zone de type « Réserve froide » dans les emplacements."
            action={<Bouton taille={64} plein surClick={retour}>Retour</Bouton>}
          />
        </div>
      </div>
    )
  }

  const conforme = etat?.dansLaPlage ?? true

  return (
    <div className="ecran">
      <Entete titre="Réserve froide" surRetour={retour} />

      <div className="contenu">
        <div className={conforme ? 'carte' : 'carte carte--alerte'}>
          <div className="entre">
            <div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--c-500)' }}>Dernier relevé</p>
              <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {etat?.valeur === undefined ? '—' : `${etat.valeur.toFixed(1)} °C`}
              </p>
            </div>
            {etat && (
              <span className={conforme ? 'badge badge--ok' : 'badge badge--dgr'}>
                {conforme ? 'Conforme' : 'Hors plage'}
              </span>
            )}
          </div>
          {etat && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--c-500)' }}>{decrireEtat(etat)}</p>}
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--c-400)' }}>
            Plage acceptable : {PLAGE_MIN} à {PLAGE_MAX} °C
          </p>
        </div>

        {etat?.quarantaineRequise && (
          <div className="bandeau">
            <Icone nom="quarantaine" taille={22} />
            <span className="bandeau__texte">
              <span className="bandeau__titre">Quarantaine déclenchée</span>
              <span className="bandeau__note">
                {etat.dureeHorsPlage} h hors plage. Le contenu doit être retiré.
              </span>
            </span>
          </div>
        )}

        <div className="carte">
          <p className="section__titre">Nouveau relevé</p>
          <Stepper valeur={valeur} surChangement={setValeur} minimum={-30} maximum={40} />
          <div style={{ marginTop: 12 }}>
            <Bouton taille={64} plein surClick={relever} disabled={enregistre}>
              {enregistre ? 'Relevé enregistré ✓' : 'Enregistrer'}
            </Bouton>
          </div>
        </div>

        {liste.length > 0 && (
          <div>
            <p className="section__titre">Derniers relevés</p>
            <div className="liste">
              {liste.slice(0, 12).map((r) => {
                const ok = r.valeur >= PLAGE_MIN && r.valeur <= PLAGE_MAX
                return (
                  <div key={r.id} className="ligne" style={{ cursor: 'default' }}>
                    <span
                      className="ligne__corps"
                      style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 13 }}
                    >
                      {new Date(r.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <span className={ok ? 'badge badge--ok' : 'badge badge--dgr'}>
                      {r.valeur.toFixed(1)} °C
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

void base