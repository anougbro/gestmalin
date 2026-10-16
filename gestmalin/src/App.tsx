import { lotsParPriorite } from './domaine/stock'
import type { Lot, Mouvement } from './domaine/types'
import './App.css'

/* Deux produits, deux situations :
   - le paracétamol a des dates  => FEFO  (OMS)
   - les serviettes n'en ont pas => FIFO */

const lots: Lot[] = [
  // Paracétamol : lot A reçu il y a 2 ans mais qui périme dans 8 semaines
  { id: 'l1', produitId: 'para', numero: 'A2X9F', peremption: '2026-08-01', originePays: 'FR', quantite: 20, emplacementId: 'emp-a204' },
  // Paracétamol : lot B reçu hier, mais qui périme dans 2 ans
  { id: 'l2', produitId: 'para', numero: 'B7K2P', peremption: '2028-03-31', originePays: 'IN', quantite: 50, emplacementId: 'emp-a204' },
  // Serviettes : pas de date de péremption
  { id: 'l3', produitId: 'serv', numero: undefined, peremption: undefined, quantite: 60, emplacementId: 'emp-m101' },
  { id: 'l4', produitId: 'serv', numero: undefined, peremption: undefined, quantite: 40, emplacementId: 'emp-m101' },
]

const mouvements: Mouvement[] = [
  { id: 'm1', type: 'reception', rayonId: 'med', produitId: 'para', lotId: 'l1', quantite: 20, versEmplacementId: 'emp-a204', auteurId: 'moi', date: '2025-03-01T09:00:00Z' },
  { id: 'm2', type: 'reception', rayonId: 'med', produitId: 'para', lotId: 'l2', quantite: 50, versEmplacementId: 'emp-a204', auteurId: 'moi', date: '2026-10-15T09:00:00Z' },
  { id: 'm3', type: 'reception', rayonId: 'men', produitId: 'serv', lotId: 'l3', quantite: 60, versEmplacementId: 'emp-m101', auteurId: 'moi', date: '2026-01-10T09:00:00Z' },
  { id: 'm4', type: 'reception', rayonId: 'men', produitId: 'serv', lotId: 'l4', quantite: 40, versEmplacementId: 'emp-m101', auteurId: 'moi', date: '2026-09-01T09:00:00Z' },
]

function App() {
  const para = lotsParPriorite('para', lots, mouvements)
  const serv = lotsParPriorite('serv', lots, mouvements)

  return (
    <main style={{ padding: '32px 24px', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        Test de la rotation
      </h1>
      <p style={{ color: 'var(--c-600)', margin: '0 0 32px', fontSize: 15 }}>
        Quel lot doit sortir en premier ?
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, color: 'var(--teal-700)', margin: '0 0 2px' }}>
          Paracétamol — FEFO
        </h2>
        <p style={{ fontSize: 13, color: 'var(--c-500)', margin: '0 0 12px' }}>
          Lot A reçu en <strong>mars 2025</strong>, périme le <strong>01/08/2026</strong> (8 semaines)
          <br />
          Lot B reçu <strong>hier</strong>, périme le <strong>31/03/2028</strong> (2 ans)
        </p>
        <ol style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, margin: 0, paddingLeft: 20 }}>
          {para.map((l) => (
            <li key={l.id} style={{ marginBottom: 4 }}>
              lot <strong>{l.id}</strong> · n° {l.numero} · périme {l.peremption}
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 13, color: 'var(--c-600)', margin: '10px 0 0' }}>
          → Le lot le plus <strong>ancien</strong> sort en premier. Un FIFO l'aurait fait
          sortir en dernier, et 20 boîtes seraient parties à la poubelle.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 17, color: 'var(--amb-700)', margin: '0 0 2px' }}>
          Serviettes — FIFO
        </h2>
        <p style={{ fontSize: 13, color: 'var(--c-500)', margin: '0 0 12px' }}>
          Lot 3 reçu en <strong>janvier 2026</strong> · Lot 4 reçu en <strong>septembre 2026</strong>
          <br />
          Aucune date de péremption → la règle FEFO ne s'applique pas.
        </p>
        <ol style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, margin: 0, paddingLeft: 20 }}>
          {serv.map((l) => (
            <li key={l.id} style={{ marginBottom: 4 }}>
              lot <strong>{l.id}</strong> · reçu {l.peremption ?? '—'} · {l.quantite} unités
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 13, color: 'var(--c-600)', margin: '10px 0 0' }}>
          → Le lot le plus <strong>ancien</strong> sort en premier. L'ordre d'arrivée
          est déduit des mouvements, pas stocké.
        </p>
      </section>
    </main>
  )
}

export default App