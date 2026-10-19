import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { produits, rechercher, receptionner, stockDe, nouvelId } from '../donnees/depots'
import type { ProduitRow } from '../donnees/base'
import { Icone } from './Icones'
import { Bouton, Champ, Entete, Stepper, Vide } from './Primitives'
import { FenetreScan } from './FenetreScan'
import type { CodeLu } from '../domaine/codeBarres'
import { suiteDuCode } from '../domaine/reception'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'

/* ============================================================
   LA RECEPTION — le geste le plus repetitif, donc le plus rapide

   Un scan remplit produit, lot ET peremption. Le seul champ qui
   reste a toucher, c'est la quantite.

   Que faire d'un code lu ? La question est posee ici et dans la
   sortie ; la reponse est ecrite une seule fois, dans
   `domaine/reception.ts`. Cet ecran ne fait que la montrer.

   Le cas le plus courant le premier jour n'est pas l'erreur :
   c'est le produit qu on n a jamais vu. L ecran propose donc de
   le creer sur place, code, lot et peremption deja remplis.
   ============================================================ */

type Inconnu = { gtin: string; lot: string; peremption: string }

export function EcranReception({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir } = useSession()

  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<ProduitRow[]>([])
  const [choisi, setChoisi] = useState<ProduitRow | null>(null)
  const [scanner, setScanner] = useState(false)
  const [inconnu, setInconnu] = useState<Inconnu | null>(null)
  const [nouveauNom, setNouveauNom] = useState('')

  const [quantite, setQuantite] = useState(1)
  const [lot, setLot] = useState('')
  const [peremption, setPeremption] = useState('')
  const [enStock, setEnStock] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    ;(async () => setResultats(await rechercher(rayon.id, texte)))()
    return () => { annule = true; void annule }
  }, [texte, rayon])

  useEffect(() => {
    if (!choisi) return
    void stockDe(choisi.id).then(setEnStock)
  }, [choisi])

  function choisir(p: ProduitRow) {
    setChoisi(p)
    setResultats([])
    setTexte('')
    setQuantite(1)
    setInconnu(null)
    setMessage(null)
  }

  async function surCode(code: CodeLu) {
    setScanner(false)

    /* La seule lecture de base que cet ecran fait pour un scan :
       le produit correspondant au code. Tout le reste — savoir
       s il est dans le bon rayon, s il existe, s il faut le
       creer — est decide dans `domaine/reception.ts`. */
    const trouve = code.gtin ? await produits.parCodeBarres(code.gtin) : undefined
    const suite = suiteDuCode(code, rayon.id, trouve, (id) =>
      RAYONS_PAR_DEFAUT.find((r) => r.id === id)?.nom,
    )

    switch (suite.cas) {
      case 'produit':
        choisir(suite.produit)
        setLot(suite.lot)
        setPeremption(suite.peremption)
        setMessage('Scanné — il ne reste que la quantité.')
        return

      case 'autre-rayon':
        setMessage(`${suite.produit.nomFr} est dans ${suite.nomRayon}, pas ici.`)
        return

      case 'a-creer':
        setInconnu({ gtin: suite.gtin, lot: suite.lot, peremption: suite.peremption })
        setNouveauNom('')
        setQuantite(1)
        setMessage(null)
        return

      case 'illisible':
        setMessage(`Code non reconnu : ${suite.brut}. Cherche par nom.`)
        return
    }
  }

  async function valider() {
    if (!choisi) return
    await receptionner({
      rayonId: rayon.id,
      produitId: choisi.id,
      quantite,
      numero: lot || undefined,
      peremption: peremption || undefined,
      auteurId: utilisateur?.id ?? 'anonyme',
    })
    await rafraichir()
    setChoisi(null)
    setQuantite(1)
    setLot('')
    setPeremption('')
    setMessage('Reçu. La boîte est au quai, à ranger.')
  }

  /* ---------- Creation sur place ---------- */

  async function creerPuisRecevoir() {
    if (!inconnu || !nouveauNom.trim()) return

    const fiche: ProduitRow = {
      id: nouvelId(),
      rayonId: rayon.id,
      categorieId: '',
      nomFr: nouveauNom.trim(),
      codeBarres: inconnu.gtin,
      unite: 'boite',
      seuil: 0,
      actif: true,
    }
    await produits.enregistrer(fiche)
    await rafraichir()

    /* On enchaîne : creer la fiche, puis enregistrer la boite.
       Le but du scan est de moins taper, pas d'en taper plus. */
    const cree = await produits.parId(fiche.id)
    if (!cree) return

    await receptionner({
      rayonId: rayon.id,
      produitId: cree.id,
      quantite,
      numero: inconnu.lot || undefined,
      peremption: inconnu.peremption || undefined,
      auteurId: utilisateur?.id ?? 'anonyme',
    })
    await rafraichir()

    setInconnu(null)
    setNouveauNom('')
    setQuantite(1)
    setMessage('Reçu. La boîte est au quai, à ranger.')
  }

  /* ---------- Fiche a creer ---------- */

  if (inconnu) {
    return (
      <div className="ecran">
        <Entete titre="Produit à créer" surRetour={() => { setInconnu(null); setMessage(null) }} />

        <div className="contenu">
          <div className="bandeau bandeau--neutre">
            <span className="bandeau__texte">
              <span className="bandeau__titre">Pas encore au catalogue</span>
              <span className="bandeau__note">Le code a été lu. Il manque le nom.</span>
            </span>
          </div>

          <Champ label="Code-barres" aide="Lu sur la boîte">
            <input className="champ__saisie" value={inconnu.gtin} readOnly />
          </Champ>

          <Champ label="Nom du produit" aide="Écris ce qui est sur la boîte">
            <input
              className="champ__saisie"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="Paracétamol 500 mg…"
              autoFocus
            />
          </Champ>

          <Champ label="Quantité reçue">
            <Stepper valeur={quantite} surChangement={setQuantite} minimum={1} />
          </Champ>

          {inconnu.lot && (
            <Champ label="N° de lot" aide="Lu sur la boîte">
              <input className="champ__saisie" value={inconnu.lot} readOnly />
            </Champ>
          )}

          {inconnu.peremption && (
            <Champ label="Péremption" aide="Lue sur la boîte">
              <input className="champ__saisie" type="date" value={inconnu.peremption} readOnly />
            </Champ>
          )}

          <Bouton taille={64} plein surClick={() => void creerPuisRecevoir()} disabled={!nouveauNom.trim()}>
            Créer et recevoir
          </Bouton>

          <button className="btn btn--discret btn--plein" onClick={() => setInconnu(null)}>
            Annuler
          </button>
        </div>
      </div>
    )
  }

  if (choisi) {
    return (
      <div className="ecran">
        <Entete titre={choisi.nomFr} surRetour={() => setChoisi(null)} />

        <div className="contenu">
          <div className="carte">
            <div className="entre">
              <span style={{ fontSize: 13, color: 'var(--c-500)' }}>En stock</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{enStock}</span>
            </div>
          </div>

          {message && (
            <div className="bandeau bandeau--neutre">
              <span className="bandeau__texte"><span className="bandeau__titre">{message}</span></span>
            </div>
          )}

          <Champ label="Quantité reçue">
            <Stepper valeur={quantite} surChangement={setQuantite} minimum={1} autoFocus />
          </Champ>

          <Champ label="N° de lot" aide="Venu du code-barre si présent">
            <input
              className="champ__saisie"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="—"
            />
          </Champ>

          <Champ label="Péremption" aide="Format : AAAA-MM-JJ">
            <input
              className="champ__saisie"
              type="date"
              value={peremption}
              onChange={(e) => setPeremption(e.target.value)}
            />
          </Champ>

          <Bouton taille={64} plein surClick={valider}>
            Valider
          </Bouton>
        </div>
      </div>
    )
  }

  if (scanner) {
    return (
      <div className="ecran" style={{ background: 'var(--c-900)' }}>
        <FenetreScan surCode={surCode} fermer={() => setScanner(false)} />
      </div>
    )
  }

  return (
    <div className="ecran">
      <Entete titre="Réception" surRetour={retour} />

      <div className="contenu">
        <button className="btn btn--primaire btn--large btn--plein" onClick={() => setScanner(true)}>
          <Icone nom="camera" taille={24} />
          Scanner la boîte
        </button>

        {/* Le message doit vivre ICI, pas seulement sur l'ecran
           du produit choisi. Deux des quatre issues d'un scan se
           produisent alors qu'aucun produit n'est selectionne :
           « ce produit est dans Menagers » et « code non
           reconnu ». Sans cette ligne, l'ecran restait muet, et la
           personne ne pouvait pas savoir si le scan avait
           fonctionne ou echoue. Elle reessayait, scannait la
           boite encore, puis venait dire que le scan ne
           marche pas. */}
        {message && (
          <div className="bandeau bandeau--neutre">
            <span className="bandeau__texte"><span className="bandeau__titre">{message}</span></span>
          </div>
        )}

        <Champ label="Ou chercher par nom">
          <input
            className="champ__saisie"
            value={texte}
            /* Retaper un nom fait disparaitre le message du scan :
               sinon « Savon est dans Ménagers » reste affiche
               pendant qu'on cherche autre chose, et on lit une
               information qui ne parle plus de rien. */
            onChange={(e) => { setTexte(e.target.value); setMessage(null) }}
            placeholder="Paracétamol…"
            autoFocus
          />
        </Champ>

        {resultats.length > 0 ? (
          <div className="liste">
            {resultats.map((p) => (
              <button key={p.id} className="ligne" onClick={() => choisir(p)}>
                <Icone nom="capsule" taille={22} />
                <span className="ligne__corps">
                  <span className="ligne__titre">{p.nomFr}</span>
                  <span className="ligne__note">{p.codeBarres ?? '—'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : texte.trim() ? (
          <Vide
            titre="Produit inconnu"
            note="Crée sa fiche depuis l'écran Produits."
          />
        ) : message ? null : (
          /* Le rappel du quai n'a pas sa place sous un message :
             « Reçu. La boîte est au quai » suivi de « la
             marchandise reçue arrive au quai » se répète deux
             fois en deux lignes. */
          <p style={{ color: 'var(--c-500)', fontSize: 13.5, textAlign: 'center' }}>
            La marchandise reçue arrive au quai. Tu la poses après.
          </p>
        )}
      </div>
    </div>
  )
}
