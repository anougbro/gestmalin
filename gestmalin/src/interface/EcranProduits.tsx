import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { produits } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Bouton, Champ, Entete, Stepper, Vide } from './Primitives'
import type { Ecran as NomEcran } from '../App'

/* ============================================================
   LES PRODUITS — le catalogue du rayon

   Les attributs medicamenteux (DCI, forme, dosage, laboratoire,
   pays d'origine) existent mais restent VIDES quand ils n'ont
   pas de sens. Une lessive n'a pas de DCI : le champ est vide,
   il n'y a rien a contourner.
   ============================================================ */

export function EcranProduits({
  retour,
  aller,
}: {
  retour: () => void
  aller: (e: NomEcran) => void
}) {
  const { rayon } = useSession()
  const [liste, setListe] = useState<ProduitRow[]>([])
  const [edition, setEdition] = useState<ProduitRow | null>(null)
  const [nouveau, setNouveau] = useState(false)

  async function charger() {
    setListe((await produits.duRayon(rayon.id)).sort((a, b) => a.nomFr.localeCompare(b.nomFr)))
  }
  useEffect(() => { void charger() }, [rayon])

  if (edition || nouveau) {
    const p = edition
    const maj = (modifs: Partial<ProduitRow>) =>
      setEdition((e) => (e ? { ...e, ...modifs } : {
        id: crypto.randomUUID(), rayonId: rayon.id, categorieId: 'c-defaut', nomFr: '',
        unite: 'boite', seuil: 5, actif: true, ...modifs,
      }))

    return (
      <div className="ecran">
        <Entete titre={p ? 'Modifier' : 'Nouveau produit'} surRetour={() => { setEdition(null); setNouveau(false) }} />

        <div className="contenu">
          <Champ label="Nom">
            <input className="champ__saisie" value={p?.nomFr ?? ''} onChange={(e) => maj({ nomFr: e.target.value })} autoFocus />
          </Champ>

          <Champ label="Code-barres" aide="Facultatif">
            <input className="champ__saisie" value={p?.codeBarres ?? ''} onChange={(e) => maj({ codeBarres: e.target.value })} inputMode="numeric" />
          </Champ>

          <Champ label="Seuil d'alerte" aide="On alerte quand il reste moins que ça.">
            <Stepper valeur={p?.seuil ?? 5} surChangement={(n) => maj({ seuil: n })} minimum={0} />
          </Champ>

          <Champ label="Unité">
            <select className="champ__saisie" value={p?.unite ?? 'boite'} onChange={(e) => maj({ unite: e.target.value as ProduitRow['unite'] })}>
              <option value="boite">Boîte</option>
              <option value="plaquette">Plaquette</option>
              <option value="sachet">Sachet</option>
              <option value="piece">Pièce</option>
              <option value="litre">Litre</option>
            </select>
          </Champ>

          <div>
            <p className="section__titre">Médicament ?</p>
            <div className="carte">
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--c-500)' }}>
                À remplir seulement pour un médicament. Pour une lessive, on laisse vide.
              </p>
              <div className="colonne">
                <input className="champ__saisie" placeholder="DCI" value={p?.dci ?? ''} onChange={(e) => maj({ dci: e.target.value })} />
                <input className="champ__saisie" placeholder="Forme" value={p?.forme ?? ''} onChange={(e) => maj({ forme: e.target.value })} />
                <input className="champ__saisie" placeholder="Pays d'origine" value={p?.paysOrigine ?? ''} onChange={(e) => maj({ paysOrigine: e.target.value })} />
              </div>
            </div>
          </div>

          <Bouton
            taille={64}
            plein
            surClick={async () => {
              if (!p?.nomFr.trim()) return
              await produits.enregistrer(p)
              setEdition(null)
              setNouveau(false)
              await charger()
            }}
            disabled={!p?.nomFr?.trim()}
          >
            Enregistrer
          </Bouton>
        </div>
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete
        titre="Produits"
        surRetour={retour}
        action={<span className="num" style={{ fontSize: 13, color: 'var(--c-500)' }}>{liste.length}</span>}
      />

      <div className="contenu">
        <div className="grille-2">
          <Bouton taille={64} plein surClick={() => setNouveau(true)}>Nouveau</Bouton>
          <Bouton variante="secondaire" taille={64} icone="export" surClick={() => aller('fichiers')}>Fichiers</Bouton>
        </div>

        {liste.length === 0 ? (
          <Vide titre="Rayon vide" note="Ajoute un produit ou importe un fichier." />
        ) : (
          <div className="liste">
            {liste.map((p) => (
              <button key={p.id} className="ligne" onClick={() => setEdition(p)}>
                <span className="ligne__corps">
                  <span className="ligne__titre">{p.nomFr}</span>
                  <span className="ligne__note">
                    {p.codeBarres ?? '—'} · seuil <span className="num">{p.seuil}</span>
                  </span>
                </span>
                {p.paysOrigine && <span className="badge">{p.paysOrigine}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
