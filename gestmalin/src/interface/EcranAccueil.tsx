import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base, ATTENTE_ID } from '../donnees/base'
import { quantiteProduit } from '../domaine/stock'
import { Icone, type NomIcone } from './Icones'
import { Tuile } from './Primitives'
import type { Ecran as NomEcran } from '../App'

/* ============================================================
   L'ACCUEIL

   Sur telephone : cinq grosses tuiles, deux par deux. On vise
   avec le pouce, sans lire.

   Sur ordinateur : ce n'est PAS la meme chose avec trois
   colonnes de plus. Un ecran large merite une vraie page —
   un titre, des chiffres, et les gestes en lecture horizontale.
   ============================================================ */

type Gestes = { ecran: NomEcran; icone: NomIcone; label: string; aide: string }

const GESTES: Gestes[] = [
  { ecran: 'chercher', icone: 'loupe', label: 'Trouver', aide: 'Où est un produit' },
  { ecran: 'ranger', icone: 'boite', label: 'Ranger', aide: 'Ce qui attend au quai' },
  { ecran: 'reception', icone: 'boite-entree', label: 'Réception', aide: 'Enregistrer une livraison' },
  { ecran: 'sortie', icone: 'boite-sortie', label: 'Sortie', aide: 'Servir, casser, jeter' },
  { ecran: 'compter', icone: 'compteur', label: 'Compter', aide: 'Inventaire par zone' },
]

export function EcranAccueil({ aller }: { aller: (e: NomEcran, c?: Record<string, unknown>) => void }) {
  const { rayon, compteurs, utilisateur, enAttenteValidation } = useSession()
  const [auQuai, setAuQuai] = useState(0)
  const [references, setReferences] = useState(0)
  const [enStock, setEnStock] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [produits, mouvements] = await Promise.all([
        base.produits.where('rayonId').equals(rayon.id).toArray(),
        base.mouvements.where('rayonId').equals(rayon.id).toArray(),
      ])

      setReferences(produits.length)

      let quantites = 0
      for (const p of produits) quantites += Math.max(0, quantiteProduit(p.id, mouvements))
      setEnStock(quantites)

      /* Ce qui est arrive et n'est pas encore pose : recu au quai
         moins ce qui en est deja reparti. */
      const net = new Map<string, number>()
      for (const m of mouvements) {
        const cle = m.lotId ?? m.produitId
        if (m.versEmplacementId === ATTENTE_ID) net.set(cle, (net.get(cle) ?? 0) + m.quantite)
        if (m.depuisEmplacementId === ATTENTE_ID) net.set(cle, (net.get(cle) ?? 0) - m.quantite)
      }
      setAuQuai([...net.values()].reduce((s, v) => s + Math.max(0, v), 0))
    })()
  }, [rayon, compteurs.total])

  return (
    <div className="ecran">
      <div className="contenu accueil">

        <header className="accueil__tete">
          <div>
            <p className="accueil__sur">{rayon.nom}</p>
            <h1 className="accueil__titre">Bonjour</h1>
          </div>
          <p className="accueil__qui">{utilisateur?.nom}</p>
        </header>

        <div className="accueil__stats">
          <div className="stat">
            <span className="stat__valeur num">{references}</span>
            <span className="stat__mot">Références</span>
          </div>
          <div className={compteurs.total > 0 ? 'stat stat--alerte' : 'stat'}>
            <span className="stat__valeur num">{compteurs.total}</span>
            <span className="stat__mot">Alertes</span>
          </div>
          <div className="stat">
            <span className="stat__valeur num">{auQuai}</span>
            <span className="stat__mot">Au quai</span>
          </div>
          <div className="stat">
            <span className="stat__valeur num">{enStock}</span>
            <span className="stat__mot">Unités en stock</span>
          </div>
        </div>

        <div>
          <p className="section__titre">Gestes</p>
          <div className="accueil__gestes">
            {GESTES.map(({ ecran, icone, label, aide }, i) => (
              <button
                key={ecran}
                /* Sur telephone, cinq tuiles ne rentrent pas en deux
                   colonnes : la derniere resterait seule et bancale.
                   Compter occupe donc toute la largeur, comme dans la
                   maquette d'origine. */
                className={i === GESTES.length - 1 ? 'pos geste geste--large' : 'pos geste'}
                onClick={() => aller(ecran)}
                /* La pastille vit DANS le bouton : sans ce nom, le
                   bouton s'appellerait « 12 Ranger » et l'ecran
                   ne serait plus trouvable au doigt comme au
                   clavier. Le chiffre est une information, pas
                   une partie du nom. */
                aria-label={label}
              >
                {ecran === 'ranger' && auQuai > 0 && (
                  <span className="pastille num">{auQuai}</span>
                )}
                <Icone nom={icone} taille={24} className="geste__icone" />
                <span className="geste__label">{label}</span>
                <span className="geste__aide">{aide}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="section__titre">Gestion</p>
          {/* Le meme ecran porte le meme nom partout. Sur telephone
              il apparait dans la meme grille que les deux autres,
              avec la meme forme : le doigt ne doit pas changer de
              cible selon la largeur.

              Ces sept tuiles ne sont pas un supplement : sur
              telephone, la barre laterale est masquee. Une tuile
              absente ici, c'est un ecran qui n'existe pas. */}
          <div className="grille-2">
            <Tuile
              icone="capsule" label="Produits" note="Catalogue" ton={rayon.ton}
              surClick={() => aller('produits')}
            />
            <Tuile
              icone="cloche" label="Alertes" note="À traiter" ton={rayon.ton}
              pastille={compteurs.total} surClick={() => aller('alertes')}
            />
            <Tuile
              icone="quarantaine" label="À valider" note="Décisions" ton={rayon.ton}
              pastille={enAttenteValidation} surClick={() => aller('valider')}
            />
            <Tuile
              icone="fournisseur" label="Commander" note="Réappro" ton={rayon.ton}
              surClick={() => aller('commander')}
            />
            <Tuile
              icone="froid" label="Réserve froide" note="Température" ton={rayon.ton}
              surClick={() => aller('froid')}
            />
            <Tuile
              icone="etiquette" label="Étiquettes" note="Imprimer" ton={rayon.ton}
              surClick={() => aller('etiquettes')}
            />
            <Tuile
              icone="export" label="Fichiers" note="Import · Export" ton={rayon.ton}
              surClick={() => aller('fichiers')}
            />
            <Tuile
              icone="grille" label="Réglages" note="Compte · Essai" ton={rayon.ton}
              surClick={() => aller('reglages')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}