import { useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { chargerJeuEssai, chargerPersonnes } from '../donnees/jeuEssai'
import { empreinte } from '../domaine/acces'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { Icone } from './Icones'
import { Bouton, Entete } from './Primitives'

/* ============================================================
   LES REGLAGES

   L'ecran qu'on ouvre rarement, et qui doit etre clair quand
   on l'ouvre : charger un jeu d'essai, tout effacer, changer
   son code.
   ============================================================ */

export function EcranReglages({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir, toutEffacer: vider } = useSession()
  const [nouveauCode, setNouveauCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function charger() {
    const r = await chargerJeuEssai(rayon.id, RAYONS_PAR_DEFAUT.find((x) => x.id !== rayon.id)?.id ?? rayon.id, utilisateur?.id ?? 'u-1')
    await chargerPersonnes(rayon.id, RAYONS_PAR_DEFAUT.find((x) => x.id !== rayon.id)?.id ?? rayon.id)
    setMessage(`${r.produits} produits et ${r.mouvements} mouvements chargés.`)
    await rafraichir()
  }

  async function changerCode() {
    if (nouveauCode.length !== 4 || !utilisateur) return
    await base.utilisateurs.put({ ...utilisateur, empreinte: empreinte(utilisateur.id, nouveauCode) })
    setMessage('Code changé. Il sera demandé à la prochaine ouverture.')
    setNouveauCode('')
  }

  async function effacerTout() {
    if (!confirm('Effacer TOUT : produits, lots, mouvements, alerts ?\n\nCette action est définitive.')) return
    await vider()
    await chargerPersonnes(rayon.id, RAYONS_PAR_DEFAUT.find((x) => x.id !== rayon.id)?.id ?? rayon.id)
    setMessage('Tout a été effacé. Les zones et emplacements sont conservés.')
    await rafraichir()
  }

  return (
    <div className="ecran">
      <Entete titre="Réglages" surRetour={retour} />

      <div className="contenu">
        {message && (
          <div className="bandeau bandeau--neutre">
            <span className="bandeau__texte">
              <span className="bandeau__titre">{message}</span>
            </span>
          </div>
        )}

        <div className="carte">
          <p className="section__titre">Jeu d'essai</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Des médicaments et des produits ménagers, avec des lots qui périment tôt
            et d'autres tard, du stock à des niveaux variés, et trois boîtes au quai
            qui attendent d'être rangées.
          </p>
          <Bouton taille={56} plein surClick={charger}>Charger le jeu d'essai</Bouton>
        </div>

        <div className="carte">
          <p className="section__titre">Mon code</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            {utilisateur ? `${utilisateur.nom} — ${utilisateur.role}` : ''}
          </p>
          <div className="pave" style={{ gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 260 }}>
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                className="pave__touche"
                style={{ background: 'var(--c-100)', color: 'var(--c-800)', minHeight: 52 }}
                onClick={() => setNouveauCode((v) => (v.length >= 4 ? v : v + String(i + 1)))}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Bouton variante="secondaire" surClick={changerCode} disabled={nouveauCode.length !== 4}>
              Changer le code {nouveauCode ? `(${nouveauCode})` : ''}
            </Bouton>
          </div>
        </div>

        <div className="carte">
          <p className="section__titre">Tout effacer</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Produits, lots, mouvements, alertes. Les zones et les emplacements restent.
          </p>
          <Bouton variante="danger" icone="croix" surClick={effacerTout}>Effacer les données</Bouton>
        </div>

        <div className="carte">
          <p className="section__titre">À propos</p>
          <div className="rangee" style={{ gap: 10, color: 'var(--c-600)', fontSize: 13.5 }}>
            <Icone nom="boite" taille={20} />
            <span>Gestmalin — stock hors ligne. Aucune donnée ne quitte cet appareil.</span>
          </div>
        </div>
      </div>
    </div>
  )
}