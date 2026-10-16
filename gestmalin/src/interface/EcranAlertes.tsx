import { useMemo, useState } from 'react'
import { useSession } from '../etat/useSession'
import { Icone } from './Icones'
import { Bouton, Entete, Vide } from './Primitives'
import type { Alerte, NatureAlerte } from '../domaine/alertes'

/* ============================================================
   LES ALERTES — deux blocs, pas quatre

   Rouge = « agir maintenant ». Ambre = « surveiller ».
   La NATURE de l'alerte est ecrite en toutes lettres, parce
   que quatre couleurs d'urgence ne se retiennent pas.
   ============================================================ */

const LIBELLE_NATURE: Record<NatureAlerte, string> = {
  perime: 'périmés',
  sous_seuil: 'sous le seuil',
  peremption_proche: 'péremption proche',
  quarantaine: 'quarantaine',
}

const ICONE_NATURE: Record<NatureAlerte, 'alerte' | 'cloche' | 'quarantaine' | 'boite'> = {
  perime: 'alerte',
  sous_seuil: 'cloche',
  peremption_proche: 'alerte',
  quarantaine: 'quarantaine',
}

export function EcranAlertes({ retour }: { retour: () => void }) {
  const { alertes } = useSession()
  const [niveau, setNiveau] = useState<'agir' | 'surveiller'>('agir')

  const groupes = useMemo(() => {
    const m: Record<NatureAlerte, Alerte[]> = {
      perime: [], sous_seuil: [], peremption_proche: [], quarantaine: [],
    }
    for (const a of alertes.filter((x) => x.niveau === niveau)) m[a.nature].push(a)
    return m
  }, [alertes, niveau])

  const agir = alertes.filter((a) => a.niveau === 'agir').length
  const surveiller = alertes.length - agir

  return (
    <div className="ecran">
      <Entete titre="Alertes" surRetour={retour} />

      <div className="contenu">
        <div className="grille-2">
          <button
            className={niveau === 'agir' ? 'tuile-alerte tuile-alerte--dgr' : 'tuile-alerte'}
            style={niveau === 'agir' ? { boxShadow: '0 0 0 2px var(--dgr-700)' } : undefined}
            onClick={() => setNiveau('agir')}
          >
            <span className="tuile-alerte__nombre num">{agir}</span>
            <span className="tuile-alerte__mot">Agir</span>
          </button>
          <button
            className={niveau === 'surveiller' ? 'tuile-alerte tuile-alerte--wrn' : 'tuile-alerte'}
            style={niveau === 'surveiller' ? { boxShadow: '0 0 0 2px var(--wrn-700)' } : undefined}
            onClick={() => setNiveau('surveiller')}
          >
            <span className="tuile-alerte__nombre num">{surveiller}</span>
            <span className="tuile-alerte__mot">Surveiller</span>
          </button>
        </div>

        {alertes.length === 0 ? (
          <Vide titre="Aucune alerte" note="Le stock est propre." />
        ) : (
          Object.entries(groupes)
            .filter(([, items]) => items.length > 0)
            .map(([nature, items]) => (
              <div key={nature}>
                <p className={`section__titre ${niveau === 'surveiller' ? 'section__titre--amb' : ''}`}>
                  {LIBELLE_NATURE[nature as NatureAlerte]}
                  <span className="num" style={{ color: 'var(--c-400)' }}>{items.length}</span>
                </p>
                <div className="liste">
                  {items.map((a) => (
                    <div key={a.id} className="ligne" style={{ cursor: 'default' }}>
                      <Icone nom={ICONE_NATURE[a.nature]} taille={22} />
                      <span className="ligne__corps">
                        <span className="ligne__titre">{a.libelle}</span>
                        <span className="ligne__note">{a.detail}</span>
                      </span>
                      {a.quantite !== undefined && (
                        <span className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                          {a.quantite}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}

        {niveau === 'agir' && alertes.some((a) => a.nature === 'sous_seuil') && (
          <Bouton taille={64} plein>Faire une commande</Bouton>
        )}
      </div>
    </div>
  )
}
