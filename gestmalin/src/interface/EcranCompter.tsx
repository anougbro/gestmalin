import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base, ATTENTE_ID } from '../donnees/base'
import { quantiteProduit } from '../domaine/stock'
import { calculerABC, repartition, type CategorieABC } from '../domaine/abc'
import { natureEcart, type NatureEcart } from '../domaine/ecart'
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

   Deux de ces garde-fous etaient ecrits mais pas appliques. Le
   champ `recompte` existait dans le modele de donnees, et le
   badge ABC aussi — declares, jamais remplis. C'est le meme
   piege que le scan : une intention ecrite en clair qui ne
   gagne aucun test, parce qu'aucun test ne regarde.

   Le seuil de recompte est decide dans `domaine/ecart.ts` et
   le classement ABC dans `domaine/abc.ts`. Cet ecran ne fait
   que les montrer. C'est ce qui permet de tester les deux
   sans navigateur.

   UN CHAMP, UNE NOTION
   --------------------
   `reelle` est ce qui est dans le pave a l'instant. `validee`
   dit si la ligne est terminee. Ce sont deux choses differentes,
   et les confondre fait sauter l'ecran des que le compteur pose
   un zero — parce que zero est une reponse, pas une absence de
   reponse. Une version anterieure de cet ecran confondait les
   deux, et le bouton « Zero » emenait directement au resume.
   ============================================================ */

type Ligne = {
  produit: ProduitRow
  attendue: number
  /** Ce qui est dans le pave. Null tant qu'on n a pas touche. */
  reelle: number | null
  /** La ligne est terminee et comptee. */
  validee: boolean
  /** La mesure du premier compte, quand un recompte est demande. */
  premier?: number
  code: string
  abc: CategorieABC
}

const RANG_ABC: Record<CategorieABC, number> = { A: 0, B: 1, C: 2 }

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

      /* L'ABC est recalcule a chaque ouverture, donc en
         permanence : le cahier des charges demande un recalcul a
         chaque mouvement, et le faire au moment ou l'on en a
         besoin donne le meme resultat pour un cout nul. */
      const categories = calculerABC(mouvements)

      const parId = new Map(emplacements.map((e) => [e.id, e.code]))
      const charge: Ligne[] = produits.map((p) => ({
        produit: p,
        attendue: quantiteProduit(p.id, mouvements),
        reelle: null,
        validee: false,
        code: p.emplacementId ? (parId.get(p.emplacementId) ?? '') : '',
        abc: categories.get(p.id) ?? 'C',
      }))

      /* On commence par les produits qui tournent le plus.

         Compter par ordre alphabétique revient, en pratique, a
         passer le rayonnage dans l'ordre : les references les
         plus stables d'abord. Or ce sont precisement celles dont
         un ecart met le plus de temps a ressortir. L'ordre ABC
         fait porter le doute la ou il doit porter.

         A l'interieur d'une categorie, on garde l'ordre des
         emplacements : on compte une rangee apres l'autre, ce
         qui evite de faire trois fois le aller-retour. */
      charge.sort((a, b) =>
        RANG_ABC[a.abc] - RANG_ABC[b.abc]
        || a.code.localeCompare(b.code)
        || a.produit.nomFr.localeCompare(b.produit.nomFr),
      )
      setLignes(charge)
    })()
  }, [rayon])

  const comptees = lignes.filter((l) => l.validee).length
  const restants = lignes.filter((l) => !l.validee).length
  const ecarts = useMemo(() => lignes.filter((l) => l.validee && l.reelle !== null && l.reelle !== l.attendue), [lignes])
  const courante = lignes[index]
  const avancee = comptees > 0

  /* Ce qu'il faut compter en urgence : les A, qui se trompent le
     plus vite. Le C n'est pas oublie pour autant — il attend son
     trimestre, et le resume le dit. */
  const resume = useMemo(
    () => repartition(lignes.map((l) => ({ id: l.produit.id })), new Map(lignes.map((l) => [l.produit.id, l.abc] as const))),
    [lignes],
  )

  /* La nature de l'ecart en cours : c'est elle qui decide si le
     bouton propose de valider ou de recompter. */
  const ecartCourant: NatureEcart =
    courante && courante.reelle !== null ? natureEcart(courante.attendue, courante.reelle) : 'rien'

  /* Un recompte est en cours des qu'un premier compte a ete
     mis de cote. Ce second critere est indispensable : sans lui,
     le bouton redevenirait « Valider » juste apres le premier
     passage, et il suffirait d'appuyer deux fois pour passer
     outre le controle. */
  const recompteDemande = courante?.premier !== undefined
  const doitRecompter = Boolean(courante) && (recompteDemande || ecartCourant === 'important')

  function saisir(valeur: number) {
    setLignes((l) => l.map((x, i) => (i === index ? { ...x, reelle: valeur } : x)))
  }

  /* ---------- Valider une ligne ---------- */

  function enregistrer() {
    if (!courante || courante.reelle === null) return

    /* Premier compte d'un ecart important : on ne valide PAS, on
       met la mesure de cote et on invite a recompter. Refuser
       d'avancer rendrait le controle claims ; le laisser passer
       le rendrait decoratif. */
    if (doitRecompter && !recompteDemande) {
      const premier = courante.reelle
      /* Le pave se vide. « Compte a nouveau » doit vouloir dire
         REPTER LE COMPTAGE, pas appuyer une seconde fois sur le
         meme chiffre — ce qui ne prouverait rien du tout.

         Le pave est vide au depart, et il le redevient : le
         garde-fou « champ vide au depart » joue aussi pour le
         second passage. */
      setLignes((l) => l.map((x, i) => (i === index ? { ...x, premier, reelle: null } : x)))
      return
    }

    /* Second compte : la ligne est terminee. La valeur retenue
       est celle du second compte — c'est lui qui tranche. */
    setLignes((l) => l.map((x, i) => (i === index ? { ...x, validee: true } : x)))
    setIndex((i) => Math.min(i + 1, lignes.length))
  }

  /* ---------- Cloture ---------- */

  async function valider() {
    for (const l of ecarts) {
      if (l.attendue === 0) {
        /* Produit attendu nul mais trouve : c'est du stock oublie.
           On l'entre comme une entree, avec le motif du comptage. */
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
      const delta = l.reelle! - l.attendue
      if (delta === 0) continue

      await base.mouvements.add({
        id: nouvelId(),
        type: delta > 0 ? 'reception' : 'sortie',
        rayonId: rayon.id,
        produitId: l.produit.id,
        quantite: Math.abs(delta),
        ...(delta > 0
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

  /* ---------- Resume avant cloture ---------- */

  if (courante && courante.validee) {
    return (
      <div className="ecran">
        <Entete titre="Compter" surRetour={retour} />
        <div className="contenu">
          <Vide
            titre={`${comptees} sur ${lignes.length}`}
            note={
              restants > 0
                ? `${restants} à compter encore.`
                : `${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} à enregistrer.`
            }
            action={
              <Bouton taille={64} plein surClick={valider} disabled={!avancee || restants > 0}>
                Valider le comptage
              </Bouton>
            }
          />

          <div className="carte">
            <p className="section__titre" style={{ margin: 0 }}>Ce rayon</p>
            <div className="entre" style={{ marginTop: 10 }}>
              <BadgeABC categorie="A" nombre={resume.A} />
              <BadgeABC categorie="B" nombre={resume.B} />
              <BadgeABC categorie="C" nombre={resume.C} />
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--c-500)', margin: '10px 0 0' }}>
              A : chaque semaine · B : chaque mois · C : chaque trimestre
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- Une fiche a compte ---------- */

  return (
    <div className="ecran">
      <Entete
        titre="Compter"
        surRetour={() => {
          setLignes((l) => l.map((x, i) => (i === index ? { ...x, reelle: null, premier: undefined } : x)))
          setIndex(Math.max(0, index - 1))
        }}
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

        <div className="entre">
          <BadgeABC categorie={courante.abc} />
          {courante.abc !== 'C' && (
            <span style={{ fontSize: 12.5, color: 'var(--c-500)' }}>
              {courante.abc === 'A' ? 'Compte chaque semaine' : 'Compte chaque mois'}
            </span>
          )}
        </div>

        <Stepper valeur={courante.reelle ?? 0} surChangement={saisir} minimum={0} autoFocus />

        <p style={{ color: 'var(--c-500)', fontSize: 13, textAlign: 'center', margin: 0 }}>
          Compte ce que tu vois. L'application ne te montre pas ce qu'elle croit.
        </p>

        <div className="grille-2">
          <Bouton variante="secondaire" surClick={enregistrer} disabled={courante.reelle === null}>
            {doitRecompter && !recompteDemande ? 'Recompter' : 'Valider'}
          </Bouton>
          <Bouton variante="secondaire" surClick={() => saisir(0)}>Zéro</Bouton>
        </div>

        {courante.reelle !== null && ecartCourant === 'important' && !recompteDemande && (
          <div className="bandeau bandeau--dgr">
            <span className="bandeau__texte">
              <span className="bandeau__titre">Écart important</span>
              <span className="bandeau__note">Recompte ce produit une deuxième fois.</span>
            </span>
          </div>
        )}

        {recompteDemande && (
          <>
            <div className="bandeau bandeau--dgr">
              <span className="bandeau__texte">
                <span className="bandeau__titre">Deuxième compte</span>
                <span className="bandeau__note">Compte à nouveau. Premier compte : {courante.premier}.</span>
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--c-500)', textAlign: 'center', margin: 0 }}>
              Le pave est vide : compte de nouveau.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Le badge ---------- */

/* Gris, toujours. Un badge rouge en haut d'un ecran de comptage
   ferait croire a une urgence : le classement ABC parle de
   rotation, pas de danger. La seule couleur d'alerte de cet
   ecran est l'ecart important, et elle est ailleurs. */
export function BadgeABC({ categorie, nombre }: { categorie: CategorieABC; nombre?: number }) {
  const frequence = { A: 'compte chaque semaine', B: 'compte chaque mois', C: 'compte chaque trimestre' }[categorie]
  return (
    <span className={`badge-abc badge-abc--${categorie.toLowerCase()}`} aria-label={`Rotation ${categorie}, ${nombre ?? frequence}`}>
      <span aria-hidden="true">{categorie}</span>
      {nombre !== undefined && <span className="num" aria-hidden="true">{nombre}</span>}
    </span>
  )
}