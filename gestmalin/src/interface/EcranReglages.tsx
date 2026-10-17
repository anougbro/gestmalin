import { useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { chargerJeuEssai, chargerPersonnes, COMPTES_ESSAI } from '../donnees/jeuEssai'
import { empreinte, LONGUEUR_CODE } from '../domaine/acces'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { Icone } from './Icones'
import { Bouton, Entete, PastillesCode, PavillonNumerique } from './Primitives'

/* ============================================================
   LES REGLAGES

   L'ecran qu'on ouvre rarement, et qui doit etre clair quand
   on l'ouvre : changer son code, charger un jeu d'essai, tout
   effacer.
   ============================================================ */

export function EcranReglages({ retour }: { retour: () => void }) {
  const { rayon, utilisateur, rafraichir, toutEffacer: vider } = useSession()
  const [message, setMessage] = useState<string | null>(null)

  const autreRayon = RAYONS_PAR_DEFAUT.find((x) => x.id !== rayon.id)?.id ?? rayon.id

  /* ---------- Changer son code ----------

     Deux saisies. Une seule laisserait la porte ouverte a une
     faute de frappe : le code serait remplace, la personne ne le
     retiendrait pas, et il est perdu — il n'est stocke qu'en
     empreinte, donc personne ne peut verifier ce qu'elle vient de
     taper, et il n'y a pas de serveur pour le reinitialiser.

     Il existe bien une cle de secours a la connexion (« Code
     oublie ? »), mais elle remet 0000 et laisse toute la
     pharmacie au meme code. Mieux vaut ne pas avoir a s'en servir. */
  const [code, setCode] = useState('')
  const [premier, setPremier] = useState<string | null>(null)
  const [erreurCode, setErreurCode] = useState<string | null>(null)

  const enConfirmation = premier !== null

  function ajouterChiffre(c: string) {
    setErreurCode(null)
    setCode((v) => (v.length >= LONGUEUR_CODE ? v : v + c))
  }
  function effacerChiffre() {
    setErreurCode(null)
    setCode((v) => v.slice(0, -1))
  }

  function validerCode() {
    if (code.length !== LONGUEUR_CODE || !utilisateur) return

    if (!enConfirmation) {
      setPremier(code)
      setCode('')
      setErreurCode(null)
      return
    }

    if (code !== premier) {
      setErreurCode('Les deux codes ne sont pas pareils. Recommence.')
      setPremier(null)
      setCode('')
      return
    }

    void (async () => {
      await base.utilisateurs.put({ ...utilisateur, longueurCode: LONGUEUR_CODE, empreinte: empreinte(utilisateur.id, code) })
      setMessage(`Code changé. Le nouveau code est pris en compte dès la prochaine connexion.`)
      setPremier(null)
      setCode('')
    })()
  }

  function annulerChangement() {
    setPremier(null)
    setCode('')
    setErreurCode(null)
  }

  /* ---------- Le reste ---------- */

  async function charger() {
    const r = await chargerJeuEssai(rayon.id, autreRayon, utilisateur?.id ?? 'u-1')
    await chargerPersonnes(rayon.id, autreRayon)
    setMessage(`${r.produits} produits et ${r.mouvements} mouvements chargés.`)
    await rafraichir()
  }

  /* Remettre les comptes de l'essai a leurs codes annonces.
     Utile quand la base a ete reparee apres un changement de
     longueur : tout le monde est alors passe a 00000, et la
     liste ci-dessus ne dit plus vrai. */
  async function remettreLesComptes() {
    await chargerPersonnes(rayon.id, autreRayon)
    setMessage('Les codes de l\'essai sont remis.')
    await rafraichir()
  }

  async function effacerTout() {
    if (!confirm('Effacer TOUT : produits, lots, mouvements, alertes ?\n\nCette action est définitive.')) return
    await vider()
    await chargerPersonnes(rayon.id, autreRayon)
    setMessage('Tout a été effacé. Les zones et les emplacements sont conservés.')
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

        {/* ---------- Le code ---------- */}
        <div className="carte">
          <p className="section__titre">Mon code</p>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--c-700)' }}>
            {utilisateur ? `${utilisateur.nom} — ${utilisateur.role}` : ''}
          </p>

          <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--c-500)' }}>
            {enConfirmation
              ? 'Tape le même code encore une fois'
              : `Choisis un nouveau code de ${LONGUEUR_CODE} chiffres`}
          </p>

          <PastillesCode code={code} sur="clair" />

          <PavillonNumerique
            ton="clair"
            onChiffre={ajouterChiffre}
            onEffacer={effacerChiffre}
            onValider={validerCode}
            peutValider={code.length === LONGUEUR_CODE}
            libelleValider={enConfirmation ? 'Valider' : 'Suivant'}
          />

          {erreurCode && <p className="reglage__erreur">{erreurCode}</p>}

          <div style={{ marginTop: 12 }}>
            {enConfirmation ? (
              <button className="btn btn--discret" onClick={annulerChangement}>
                Recommencer
              </button>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--c-400)' }}>
                Le code n'est jamais écrit en clair, seulement son empreinte.
              </p>
            )}
          </div>
        </div>

        {/* ---------- Les personnes et leurs codes ----------

            Tant qu'on ne sait pas quel code on a choisi, on le
            demande a quelqu'un d'autre. Une liste ecrite quelque
            part evite les deux ennuis : se tromper de code, et
            croire que l'application est cassee quand elle refuse
            un code qu'on ne se rappelle pas. */}
        <div className="carte">
          <p className="section__titre">Personnes et codes</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Les codes de l'essai. Ils ne sont jamais stockés en clair
            dans l'application : elle ne compare que des empreintes.
          </p>

          <ul className="codes">
            {COMPTES_ESSAI.map((c) => (
              <li key={c.id} className="codes__ligne">
                <span className="codes__nom">{c.nom}</span>
                <span className="codes__peut">{c.peut}</span>
                <span className="codes__code num">{c.code}</span>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 12 }}>
            <Bouton variante="secondaire" surClick={() => void remettreLesComptes()}>
              Remettre les codes de l'essai
            </Bouton>
          </div>
        </div>

        {/* ---------- Jeu d'essai ---------- */}
        <div className="carte">
          <p className="section__titre">Jeu d'essai</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Des médicaments et des produits ménagers, avec des lots qui périment tôt
            et d'autres tard, du stock à des niveaux variés, et trois boîtes au quai
            qui attendent d'être rangées.
          </p>
          <Bouton taille={56} plein surClick={charger}>Charger le jeu d'essai</Bouton>
        </div>

        {/* ---------- Tout effacer ---------- */}
        <div className="carte">
          <p className="section__titre">Tout effacer</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Produits, lots, mouvements, alertes. Les zones et les emplacements restent.
          </p>
          <Bouton variante="danger" icone="croix" surClick={effacerTout}>Effacer les données</Bouton>
        </div>

        {/* ---------- A propos ---------- */}
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