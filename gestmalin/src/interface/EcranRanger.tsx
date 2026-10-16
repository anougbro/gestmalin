import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base, ATTENTE_ID } from '../donnees/base'
import { poserEnPlace } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Icone } from './Icones'
import { Bouton, Entete, Vide } from './Primitives'

/* ============================================================
   RANGER — « voici ce qui doit aller où »

   Le code de destination est la pastille a DROITE : c'est
   l'endroit qu'on cherche en marchant, pas le nom du produit.
   ============================================================ */

type ARanger = { lotId: string; produit: ProduitRow; quantite: number; destination?: string }

export function EcranRanger({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()
  const [liste, setListe] = useState<ARanger[]>([])
  const [fait, setFait] = useState<string | null>(null)

  async function charger() {
    const [lots, mouvements, produitsDuRayon] = await Promise.all([
      base.lots.toArray(),
      base.mouvements.where('rayonId').equals(rayon.id).toArray(),
      base.produits.where('rayonId').equals(rayon.id).toArray(),
    ])

    const parProduit: Record<string, Record<string, number>> = {}
    for (const m of mouvements) {
      parProduit[m.produitId] ??= {}
      if (m.versEmplacementId === ATTENTE_ID) {
        parProduit[m.produitId][ATTENTE_ID] = (parProduit[m.produitId][ATTENTE_ID] ?? 0) + m.quantite
      }
      if (m.depuisEmplacementId === ATTENTE_ID) {
        parProduit[m.produitId][ATTENTE_ID] = (parProduit[m.produitId][ATTENTE_ID] ?? 0) - m.quantite
      }
    }

    const auQuai = lots.filter((l) => (parProduit[l.produitId]?.[ATTENTE_ID] ?? 0) > 0)
    const destinations = new Map<string, string>()
    for (const e of await base.emplacements.toArray()) destinations.set(e.id, e.code)

    const resultat: ARanger[] = []
    for (const l of auQuai) {
      const p = produitsDuRayon.find((x) => x.id === l.produitId)
      if (!p) continue
      resultat.push({
        lotId: l.id,
        produit: p,
        quantite: parProduit[p.id][ATTENTE_ID],
        destination: p.emplacementId ? destinations.get(p.emplacementId) : undefined,
      })
    }
    setListe(resultat)
  }

  useEffect(() => { void charger() }, [rayon])

  async function poser(item: ARanger) {
    if (!item.produit.emplacementId) return
    await poserEnPlace({
      rayonId: rayon.id,
      produitId: item.produit.id,
      lotId: item.lotId,
      quantite: item.quantite,
      versEmplacementId: item.produit.emplacementId,
      auteurId: utilisateur,
    })
    setFait(item.produit.id)
    await charger()
    await rafraichir()
  }

  const total = liste.reduce((s, i) => s + i.quantite, 0)

  return (
    <div className="ecran">
      <Entete titre="Ranger" surRetour={retour} />

      <div className="contenu">
        {liste.length === 0 ? (
          <Vide titre="Tout est rangé" note="Aucune boîte en attente au quai." />
        ) : (
          <>
            <p style={{ color: 'var(--c-500)', fontSize: 13.5, margin: 0 }}>
              <span className="num">{total}</span> boîte{total > 1 ? 's' : ''} au quai
            </p>

            <div className="liste">
              {liste.map((item) => (
                <button
                  key={item.lotId}
                  className={fait === item.produit.id ? 'ligne ligne--fait' : 'ligne'}
                  onClick={() => poser(item)}
                  disabled={!item.produit.emplacementId}
                >
                  <Icone nom="boite" taille={22} />
                  <span className="ligne__corps">
                    <span className="ligne__titre">{item.produit.nomFr}</span>
                    <span className="ligne__note num">{item.quantite} boîte{item.quantite > 1 ? 's' : ''}</span>
                  </span>
                  {item.destination
                    ? <span className="destination">{item.destination}</span>
                    : <span className="badge">Sans place</span>}
                </button>
              ))}
            </div>

            <Bouton variante="secondaire" plein surClick={rafraichir}>
              Tout est rangé
            </Bouton>
          </>
        )}
      </div>
    </div>
  )
}
