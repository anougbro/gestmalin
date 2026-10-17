import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { reparerComptes, CODE_INITIAL, CODE_PAR_DEFAUT, UTILISATEUR_INITIAL } from '../etat/preparation'
import { Icone } from './Icones'
import { PastillesCode, PavillonNumerique } from './Primitives'

/* ============================================================
   LA CONNEXION

   Un pave de chiffres. Pas de mot de passe : personne ne le
   retient, et personne ne le tape d'une seule main avec des
   gants. On choisit son nom, on tape quatre chiffres, on entre.

   La connexion marche SANS RESEAU : le telephone contient la
   liste des personnes et l'empreinte de leur code.

   Deux details qui comptes :
   - le bouton d'entree porte le mot « Entrer », pas une fleche
     qui ressemble a un retour en arriere
   - il existe TOUJOURS une sortie de secours. Une application
     hors ligne, sans serveur, ne doit jamais pouvoir enfermer
     quelqu'un devant son ecran.
   ============================================================ */

export function EcranConnexion() {
  const { connecter } = useSession()
  const [liste, setListe] = useState<{ id: string; nom: string; role: string }[]>([])
  const [choisi, setChoisi] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [secours, setSecours] = useState(false)

  const recharger = () =>
    base.utilisateurs.toArray().then((tous) =>
      setListe(tous.filter((u) => u.actif).map((u) => ({ id: u.id, nom: u.nom, role: u.role }))),
    )

  useEffect(() => { void recharger() }, [])

  /* Un ecran de connexion qui avale ses erreurs est un ecran qui
     laisse croire a un code faux quand la base est cassee. On
     attrape, et on montre ce qui s'est reellement passe. */
  async function tenter(id: string) {
    try {
      const r = await connecter(id, code)
      if (r.ok) { setErreur(null); return }
      setErreur(r.message ?? 'Code incorrect.')
    } catch {
      setErreur('Connexion impossible. Réessaie.')
    } finally {
      setCode('')
    }
  }

  async function reparer() {
    if (!confirm(
      "Réinitialiser les codes ?\n\n" +
      "Les codes d'origine n'ont jamais été stockés en clair : ils sont perdus.\n" +
      "Le premier compte reprend le code 1234, les autres 0000.\n\n" +
      "À n'utiliser que si personne ne peut plus entrer.",
    )) return
    await reparerComptes()
    setSecours(false)
    setErreur(null)
    await recharger()
  }

  function chiffre(c: string) {
    setErreur(null)
    if (code.length >= 4) return
    setCode((v) => v + c)
  }

  /* Effacer le dernier chiffre. Sans cette touche, une erreur
     de frappe est irrattrapable : il faut retaper les quatre
     chiffres. J'avais supprime cette touche en nettoyant une
     erreur de compilation — une erreur de typage qui a supprime
     une fonction. Le test ne l'a pas vu : il n'y avait aucun test
     sur ce pave. */
  function effacer() {
    setErreur(null)
    setCode((v) => v.slice(0, -1))
  }

  function toutEffacer() {
    setErreur(null)
    setCode('')
  }

  const seul = liste.length <= 1
  const idCourant = seul ? (liste[0]?.id ?? UTILISATEUR_INITIAL.id) : choisi

  /* Sur ordinateur, on tape au clavier : chiffres, retour
     arriere, entree. C'est plus rapide que viser trois touches,
     et ca evite les erreurs de frappe au doigt. */
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        /* Une touche du pave garde le focus apres avoir ete
           touchee. Sans cet empirement, « Entrer » au clavier
           declenche la DERNIERE touche touchee au doigt : on
           ajoute un chiffre ou on en efface un, et le code tapé
           devient faux sans qu'on voie pourquoi.

           On neutralise donc toujours le comportement par defaut
           d'Entree, et on ne valide que si le code est complet. */
        e.preventDefault()
        if (idCourant && code.length === 4) void tenter(idCourant)
        return
      }

      if (e.key >= '0' && e.key <= '9') {
        chiffre(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        effacer()
      } else if (e.key === 'Escape') {
        toutEffacer()
      }
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  })

  return (
    <div className="ecran ecran--connexion">
      <div className="connexion">
        <div className="connexion__marque">
          <Icone nom="capsule" taille={30} />
          <span>Gestmalin</span>
        </div>

        {!seul && !idCourant && (
          <>
            <p className="connexion__titre">Qui est-ce&nbsp;?</p>
            <div className="colonne" style={{ width: '100%' }}>
              {liste.map((u) => (
                <button key={u.id} className="personne" onClick={() => setChoisi(u.id)}>
                  <Icone nom="capsule" taille={20} />
                  <span>{u.nom}</span>
                </button>
              ))}
            </div>
            <button className="btn btn--discret" style={{ color: 'rgba(255,255,255,.7)' }} onClick={reparer}>
              Code oublié ?
            </button>
          </>
        )}

        {idCourant && (
          <>
            <p className="connexion__titre">Code</p>
            <p className="connexion__indices">
              {liste.find((u) => u.id === idCourant)?.nom ?? 'Préparateur'}
            </p>

            {/* Une personne tape un code qui n'existe pas, elle
                conclut que l'application est cassee. Elle ne peut
                pas deviner qu'il manque des comptes a creer. */}
            {seul && liste.length === 1 && (
              <p className="connexion__note">Seule personne — Réglages pour en ajouter</p>
            )}

            <PastillesCode code={code} />

            <PavillonNumerique
              onChiffre={chiffre}
              onEffacer={effacer}
              onValider={() => void tenter(idCourant)}
              peutValider={code.length === 4}
            />

            {erreur && <p className="connexion__erreur">{erreur}</p>}

            {!seul && (
              <button className="btn btn--discret" style={{ color: 'rgba(255,255,255,.7)' }} onClick={() => { setChoisi(null); setCode(''); setErreur(null) }}>
                Retour
              </button>
            )}

            {secours && (
              <p className="connexion__erreur">
                Code du premier compte : {CODE_INITIAL}. Autres comptes : {CODE_PAR_DEFAUT}.
              </p>
            )}
            <button
              className="btn btn--discret"
              style={{ color: 'rgba(255,255,255,.5)', minHeight: 40 }}
              onClick={() => void reparer()}
            >
              Code oublié ?
            </button>
          </>
        )}
      </div>
    </div>
  )
}
