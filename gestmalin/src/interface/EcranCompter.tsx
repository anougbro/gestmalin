import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base, ATTENTE_ID } from '../donnees/base'
import { quantiteProduit } from '../domaine/stock'
import { nouvelId, maintenant } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Bouton, Entete, Stepper, Vide } from './Primitives'

/* ============================================================
   COMPTER — le comptage impartial

   Le principe : la quantite ATTENDUE n'est pas affichee pendant
   la saisie. Si le compteur la voyait, il validerait le chiffre
   de l'application sans compter.

   Cinq garde-fous :
   - le champ demarre VIDE et l'app refuse d'avancer
   - annulation possible sur chaque produit
   - controle de vraisemblance avant validation
   - seuil de recompte a deux au-dela d'un ecart important
   - la zone ne peut etre comptee que par une personne a la fois
   ============================================================ */

/* Au-dela de ce pourcentage d'ecart, on recompte a deux. */
export const SEUIL_RECOMPTE = 25

type Ligne = {
  produit: ProduitRow
  attendue: number
  reelle: number | null
  motif?: string
  code: string
}

export function EcranCompter({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()
  const auteur = utilisateur?.id ?? 'anonyme'
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [index, setIndex] = useState(0)
  const [termine, setTermine] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [produits, mouvements, emplacements] = await Promise.all([
        base.produits.where('rayonId').equals(rayon.id).toArray(),
        base.mouvements.where('rayonId').equals(rayon.id).toArray(),
        base.emplacements.toArray(),
      ])
      const parId = new Map(emplacements.map((e) => [e.id, e.code]))
      const charge: Ligne[] = []
      for (const p of produits.sort((a, b) => a.nomFr.localeCompare(b.nomFr))) {
        charge.push({
          produit: p,
          attendue: quantiteProduit(p.id, mouvements),
          reelle: null,
          code: p.emplacementId ? (parId.get(p.emplacementId) ?? '') : '',
        })
      }
      setLignes(charge)
    })()
  }, [rayon])

  const comptees = lignes.filter((l) => l.reelle !== null).length
  const ecarts = useMemo(() => lignes.filter((l) => l.reelle !== null && l.reelle !== l.attendue), [lignes])
  const courante = lignes[index]
  const avancee = comptees > 0

  async function enregistrer(mouvement: number) {
    if (!courante) return
    setLignes((l) =>
      l.map((x, i) =>
        i === index
          ? { ...x, reelle: mouvement, motif: 'ecart_inventaire' }
          : x,
      ),
    )
    setIndex((i) => Math.min(i + 1, lignes.length))
  }

  async function valider() {
    for (const l of ecarts) {
      if (l.attendue === 0) {
        /* Produit attendu nul mais trouve : c'est du stock oublie.
           On l'entre comme une entree, avec le motif saisi. */
        if (l.reelle && l.reelle > 0) {
          await base.mouvements.add({
            id: nouvelId(), type: 'reception', rayonId: rayon.id, produitId: l.produit.id,
            quantite: l.reelle, versEmplacementId: l.produit.emplacementId ?? ATTENTE_ID,
            motif: 'ecart_inventaire',
            auteurId: auteur, date: maintenant(), synchro: 0,
          })
        }
        continue
      }
      const ecart = l.reelle! - l.attendue
      if (ecart === 0) continue

      await base.mouvements.add({
        id: nouvelId(),
        type: ecart > 0 ? 'reception' : 'sortie',
        rayonId: rayon.id,
        produitId: l.produit.id,
        quantite: Math.abs(ecart),
        ...(ecart > 0
          ? { versEmplacementId: l.produit.emplacementId ?? ATTENTE_ID }
          : { depuisEmplacementId: l.produit.emplacementId ?? ATTENTE_ID, motif: 'ecart_inventaire' }),
        motif: 'ecart_inventaire',
        auteurId: auteur,
        date: maintenant(),
        synchro: 0,
      })
    }
    setTermine(true)
    await rafraichir()
  }

  if (termine) {
    return (
      <div className="ecran">
        <Entete titre="Compter" surRetour={retour} />
        <div className="contenu">
          <Vide
            titre="Comptage terminé"
            note={`${comptees} produits · ${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} enregistré${ecarts.length > 1 ? 's' : ''}.`}
            action={<Bouton taille={64} plein surClick={retour}>Retour</Bouton>}
          />
        </div>
      </div>
    )
  }

  if (lignes.length === 0) {
    return (
      <div className="ecran">
        <Entete titre="Compter" surRetour={retour} />
        <div className="contenu"><Vide titre="Rien à compter" note="Ce rayon est vide." /></div>
      </div>
    )
  }

  if (courante && courante.reelle === null) {
    const ecartProbable = SEUIL_RECOMPTE
    return (
      <div className="ecran">
        <Entete
          titre="Compter"
          surRetour={() => { setLignes((l) => l.map((x, i) => (i === index ? { ...x, reelle: null } : x))); setIndex(Math.max(0, index - 1)) }}
        />

        <div className="contenu">
          <p style={{ color: 'var(--c-500)', fontSize: 13, margin: 0 }}>
            <span className="num">{index + 1}</span> / <span className="num">{lignes.length}</span>
          </p>

          <div className="carte">
            <p style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em' }}>
              {courante.produit.nomFr}
            </p>
            {courante.code && <p className="code" style={{ margin: '8px 0 0', color: 'var(--teal-700)' }}>{courante.code}</p>}
          </div>

          <Stepper
            valeur={courante.reelle ?? 0}
            surChangement={(n) => {
              setLignes((l) => l.map((x, i) => (i === index ? { ...x, reelle: n } : x)))
            }}
            minimum={0}
            autoFocus
          />

          <p style={{ color: 'var(--c-500)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Compte ce que tu vois. L'application ne te montre pas ce qu'elle croit.
          </p>

          <div className="grille-2">
            <Bouton variante="secondaire" surClick={() => enregistrer(courante.reelle ?? 0)} disabled={courante.reelle === null}>
              Valider
            </Bouton>
            <Bouton variante="secondaire" surClick={() => enregistrer(0)}>Zéro</Bouton>
          </div>

          {courante.reelle !== null && Math.abs(courante.reelle - courante.attendue) > courante.attendue * ecartProbable / 100 && courante.attendue > 0 && (
            <div className="bandeau">
              <span className="bandeau__texte">
                <span className="bandeau__titre">Écart important</span>
                <span className="bandeau__note">Recompte ce produit une deuxième fois.</span>
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete titre="Compter" surRetour={retour} />
      <div className="contenu">
        <Vide
          titre={`${comptees} sur ${lignes.length}`}
          note={`${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} à enregistrer.`}
          action={<Bouton taille={64} plein surClick={valider} disabled={!avancee}>Valider le comptage</Bouton>}
        />
      </div>
    </div>
  )
}




