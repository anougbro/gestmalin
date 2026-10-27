import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { fournisseursDepot, stocksDuRayon } from '../donnees/depots'
import {
  produitsARecommander, grouperParFournisseur, commanderEnTexte,
  type CommandeFournisseur,
} from '../domaine/reappro'
import { Icone } from './Icones'
import { Bouton, Entete, Vide } from './Primitives'

/* ============================================================
   LA COMMANDE

   Groupée par fournisseur : on commande a quelqu'un, pas « un peu
   de tout ». Le texte est copiable tel quel pour etre envoye
   par message ou par courriel, meme sans reseau.
   ============================================================ */

export function EcranReappro({ retour }: { retour: () => void }) {
  const { rayon } = useSession()
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([])
  const [aJuste, setAJuste] = useState(false)

  useEffect(() => {
    void (async () => {
      const [produits, stocks, fournisseurs] = await Promise.all([
        base.produits.where('rayonId').equals(rayon.id).toArray(),
        stocksDuRayon(rayon.id),
        fournisseursDepot.duRayon(rayon.id),
      ])
      const lignes = produitsARecommander(produits, stocks)
      setCommandes(grouperParFournisseur(lignes, fournisseurs))
    })()
  }, [rayon, aJuste])

  const total = useMemo(() => commandes.reduce((s, c) => s + c.total, 0), [commandes])

  async function copier(c: CommandeFournisseur) {
    try {
      await navigator.clipboard.writeText(commanderEnTexte(c))
    } catch {
      /* Le presse-papier peut etre refuse : ce n'est pas grave,
         la liste est deja lisible a l'ecran. */
    }
  }

  async function exporterCsv() {
    const lignes = commandes.flatMap((c) =>
      c.lignes.map((l) => [c.fournisseur, l.nom, l.codeBarres ?? '', String(l.aCommander), l.unite, String(l.stock), String(l.seuil)]),
    )
    const csv = ['fournisseur,produit,code_barres,a_commander,unite,stock,seuil']
      .concat(lignes.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `commande-${rayon.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ecran">
      <Entete
        titre="Commande"
        surRetour={retour}
        action={<span className="num" style={{ fontSize: 13, color: 'var(--c-500)' }}>{total}</span>}
      />

      <div className="contenu">
        {commandes.length === 0 ? (
          <Vide titre="Rien à commander" note="Tous les produits sont au-dessus de leur seuil." />
        ) : (
          <>
            {commandes.map((c) => (
              <div key={c.fournisseurId ?? 'sans'}>
                <p className="section__titre">
                  {c.fournisseur}
                  <span className="num" style={{ color: 'var(--c-400)' }}>{c.total}</span>
                </p>
                <div className="liste">
                  {c.lignes.map((l) => (
                    <div key={l.produitId} className="ligne" style={{ cursor: 'default' }}>
                      <span className="ligne__corps">
                        <span className="ligne__titre">{l.nom}</span>
                        <span className="ligne__note">
                          {l.rupture ? 'Rupture · ' : ''}stock {l.stock} · seuil {l.seuil}
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          className="num"
                          style={{ fontSize: 19, fontWeight: 700, color: l.rupture ? 'var(--dgr-700)' : 'var(--c-800)' }}
                        >
                          {l.aCommander}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--c-500)' }}>{l.unite}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <button className="lien-fichier" onClick={() => copier(c)}>
                  <Icone nom="export" taille={19} />
                  <span>Copier la commande {c.fournisseur}</span>
                </button>
              </div>
            ))}

            <Bouton taille={64} plein surClick={() => void exporterCsv()}>Exporter en CSV</Bouton>
            <Bouton variante="secondaire" plein surClick={() => setAJuste((v) => !v)}>
              Recalculer
            </Bouton>
          </>
        )}
      </div>
    </div>
  )
}