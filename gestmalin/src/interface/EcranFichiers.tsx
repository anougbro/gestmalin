import { useState } from 'react'
import { useSession } from '../etat/useSession'
import { COLONNES, lireFichier } from '../donnees/fichiers'
import {
  appliquerImport, devinerCorrespondance, exporterProduits, simulerImport,
  type Correspondance, type ModeImport, type Simulation,
} from '../donnees/transfert'
import { Bouton, Entete, Vide } from './Primitives'
import { Icone } from './Icones'

/* ============================================================
   FICHIERS — importer et exporter, hors ligne

   Rien n'est écrit avant la simulation. L'utilisateur voit
   exactement ce qui va se passer, puis valide.
   ============================================================ */

type Etape = 'menu' | 'simulation' | 'termine'

export function EcranFichiers({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()
  const [etat, setEtat] = useState<Etape>('menu')
  const [mode, setMode] = useState<ModeImport>('catalogue')
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [correspondance, setCorrespondance] = useState<Correspondance>({})
  const [tableau, setTableau] = useState<string[][]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<{ crees: number; misAJour: number; mouvements: number } | null>(null)

  async function choisirFichier(fichier: File) {
    setErreur(null)
    try {
      const donnees = new Uint8Array(await fichier.arrayBuffer())
      const lignes = await lireFichier(donnees, fichier.name)
      if (lignes.length < 2) throw new Error('Le fichier ne contient aucune ligne de données.')

      const ent = lignes[0]
      setTableau(lignes)

      const devinee = devinerCorrespondance(ent)
      setCorrespondance(devinee)

      const sim = await simulerImport(lignes, devinee, mode)
      setSimulation(sim)
      setEtat('simulation')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.')
    }
  }

  async function importer() {
    if (!simulation) return
    const r = await appliquerImport(simulation, mode, utilisateur)
    setResultat(r)
    setEtat('termine')
    await rafraichir()
  }

  async function exporter(format: 'csv' | 'xlsx') {
    const { nom, donnees } = await exporterProduits(format, rayon.id)
    const url = URL.createObjectURL(new Blob([donnees as BlobPart]))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nom
    lien.click()
    URL.revokeObjectURL(url)
  }

  function changerMode(nouveau: ModeImport) {
    setMode(nouveau)
    if (tableau.length > 1) {
      void simulerImport(tableau, correspondance, nouveau).then((sim) => {
        setSimulation(sim)
        setEtat('simulation')
      })
    }
  }

  if (etat === 'termine' && resultat) {
    return (
      <div className="ecran">
        <Entete titre="Import terminé" surRetour={() => { setEtat('menu'); setResultat(null); setSimulation(null) }} />
        <div className="contenu">
          <Vide
            titre="C'est fait"
            note={`${resultat.crees} produits créés · ${resultat.misAJour} mis à jour${resultat.mouvements ? ` · ${resultat.mouvements} entrées de stock` : ''}.`}
            action={<Bouton taille={64} plein surClick={() => { setEtat('menu'); setResultat(null); setSimulation(null) }}>Fermer</Bouton>}
          />
        </div>
      </div>
    )
  }

  if (etat === 'simulation' && simulation) {
    const colonnesManquantes = COLONNES.filter((c) => correspondance[c] === undefined)

    return (
      <div className="ecran">
        <Entete titre="Vérifier avant d'importer" surRetour={() => setEtat('menu')} />

        <div className="contenu">
          <div className="grille-2">
            <button
              className="tuile"
              style={mode === 'catalogue' ? { borderColor: 'var(--teal-700)', background: 'var(--teal-50)' } : undefined}
              onClick={() => changerMode('catalogue')}
            >
              <span className="tuile__label">Catalogue</span>
              <span className="tuile__note">Fiches produits</span>
            </button>
            <button
              className="tuile"
              style={mode === 'stock' ? { borderColor: 'var(--teal-700)', background: 'var(--teal-50)' } : undefined}
              onClick={() => changerMode('stock')}
            >
              <span className="tuile__label">Stock</span>
              <span className="tuile__note">Quantités</span>
            </button>
          </div>

          <div className="carte">
            <p className="section__titre">Ce qui va se passer</p>
            <div className="colonne">
              <div className="entre"><span>Nouveaux produits</span><span className="num">{simulation.aCreer}</span></div>
              <div className="entre"><span>Mis à jour</span><span className="num">{simulation.aMettreAJour}</span></div>
              <div className="entre"><span>Ignorés</span><span className="num">{simulation.aIgnorer}</span></div>
              {simulation.conflits > 0 && (
                <div className="entre" style={{ color: 'var(--dgr-700)', fontWeight: 700 }}>
                  <span>Conflits de code-barres</span><span className="num">{simulation.conflits}</span>
                </div>
              )}
            </div>
          </div>

          {colonnesManquantes.length > 0 && (
            <div className="bandeau bandeau--wrn">
              <span className="bandeau__texte">
                <span className="bandeau__titre">Colonnes absentes du fichier</span>
                <span className="bandeau__note">{colonnesManquantes.join(', ')}</span>
              </span>
            </div>
          )}

          {simulation.lignes.filter((l) => l.action === 'ignorer' || l.action === 'conflit').length > 0 && (
            <div>
              <p className="section__titre">Lignes à vérifier</p>
              <div className="liste">
                {simulation.lignes
                  .filter((l) => l.action === 'ignorer' || l.action === 'conflit')
                  .slice(0, 20)
                  .map((l) => (
                    <div key={l.numero} className="ligne" style={{ cursor: 'default' }}>
                      <span className="ligne__corps">
                        <span className="ligne__titre">
                          Ligne {l.numero} — {l.valeurs.nom_fr ?? 'sans nom'}
                        </span>
                        <span className="ligne__note">
                          {l.action === 'conflit' ? 'code-barres déjà porté par un autre produit' : l.problemes.join(' · ')}
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <Bouton
            taille={64}
            plein
            surClick={importer}
            disabled={simulation.aCreer + simulation.aMettreAJour === 0}
          >
            Importer
          </Bouton>
        </div>
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete titre="Fichiers" surRetour={retour} />

      <div className="contenu">
        {erreur && (
          <div className="bandeau">
            <span className="bandeau__texte"><span className="bandeau__titre">{erreur}</span></span>
          </div>
        )}

        <div>
          <p className="section__titre">Exporter</p>
          <div className="grille-2">
            <button className="tuile" onClick={() => exporter('xlsx')}>
              <Icone nom="export" taille={26} className="tuile__icone" />
              <span className="tuile__label">Excel</span>
            </button>
            <button className="tuile" onClick={() => exporter('csv')}>
              <Icone nom="export" taille={26} className="tuile__icone" />
              <span className="tuile__label">CSV</span>
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--c-500)', marginTop: 8 }}>
            Ton catalogue du rayon {rayon.nom}. L'export est aussi ta sauvegarde.
          </p>
        </div>

        <div>
          <p className="section__titre">Importer</p>
          <label className="btn btn--secondaire btn--large btn--plein" style={{ cursor: 'pointer' }}>
            <Icone nom="import" taille={22} />
            Choisir un fichier
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void choisirFichier(f)
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}