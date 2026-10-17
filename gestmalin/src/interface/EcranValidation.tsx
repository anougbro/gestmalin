import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { approbations } from '../donnees/depots'
import { peutValider } from '../domaine/acces'
import { maintenantISO } from '../domaine/temps'
import type { DemandeApprobationRow } from '../donnees/base'
import { Icone } from './Icones'
import { Bouton, Entete, Vide } from './Primitives'

/* ============================================================
   LA VALIDATION

   Motif unique, reutilisable : une DEMANDE, une APPROBATION,
   puis un MOUVEMENT. Quarantaine, releve hors plage, demain
   peut-etre autre chose — rien a reinventer.

   Seul le responsable de son rayon, le pharmacien, ou le
   titulaire d'un mandat peut valider. Le simple fait qu'un
   ecran soit ouvert ne donne aucun droit.
   ============================================================ */

export function EcranValidation({ retour, rafraichir }: { retour: () => void; rafraichir: () => Promise<void> }) {
  const { utilisateur } = useSession()
  const [demandes, setDemandes] = useState<DemandeApprobationRow[]>([])
  const [decision, setDecision] = useState<{ ok: boolean } | null>(null)

  useEffect(() => {
    void approbations.enAttente().then(setDemandes)
  }, [])

  async function decider(d: DemandeApprobationRow, approuve: boolean) {
    if (!utilisateur) return
    await approbations.decider(d.id, approuve, utilisateur.id)
    setDecision({ ok: approuve })
    setDemandes((l) => l.filter((x) => x.id !== d.id))
    await rafraichir()
    setTimeout(() => setDecision(null), 2200)
  }

  /* On ne montre QUE ce que la personne peut réellement valider :
     afficher une demande qu'on ne peut pas traiter, c'est un piège. */
  const relevant = utilisateur
    ? demandes.filter((d) => peutValider(utilisateur, d.rayonId, maintenantISO()))
    : []

  return (
    <div className="ecran">
      <Entete
        titre="À valider"
        surRetour={retour}
        action={<span className="num" style={{ fontSize: 13, color: 'var(--c-500)' }}>{relevant.length}</span>}
      />

      <div className="contenu">
        {decision && (
          <div className="bandeau bandeau--neutre">
            <span className="bandeau__texte">
              <span className="bandeau__titre">{decision.ok ? 'Approuvé ✓' : 'Refusé'}</span>
            </span>
          </div>
        )}

        {demandes.length === 0 ? (
          <Vide titre="Rien en attente" note="Aucune demande n'attend de décision." />
        ) : relevant.length === 0 ? (
          <Vide
            titre="Pas votre décision"
            note={`${demandes.length} demande${demandes.length > 1 ? 's' : ''} en attente, mais leur approbation revient au responsable du rayon ou au pharmacien.`}
          />
        ) : (
          <div className="liste">
            {relevant.map((d) => (
              <div key={d.id} className="carte">
                <div className="rangee" style={{ marginBottom: 8 }}>
                  <Icone nom={d.type === 'releve_hors_plage' ? 'froid' : 'quarantaine'} taille={22} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 650, fontSize: 15 }}>
                      {d.type === 'releve_hors_plage' ? 'Relevé hors plage' : 'Mise en quarantaine'}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--c-500)' }}>{d.motif}</p>
                  </div>
                </div>

                {d.detail && (
                  <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>{d.detail}</p>
                )}

                <div className="grille-2">
                  <Bouton variante="secondaire" icone="croix" surClick={() => decider(d, false)}>
                    Refuser
                  </Bouton>
                  <Bouton icone="coche" surClick={() => decider(d, true)}>Valider</Bouton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

void base