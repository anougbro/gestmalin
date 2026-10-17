import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { Icone } from './Icones'

/* ============================================================
   LA CONNEXION

   Un pavé de chiffres. Pas de mot de passe : personne ne le
   retient, et personne ne le tape d'une seule main avec des
   gants. On choisit son nom, on tape quatre chiffres, on entre.

   L'identifiant et l'empreinte sont Lus SUR LE TELEPHONE :
   la connexion marche sans aucun reseau.
   ============================================================ */

export function EcranConnexion() {
  const { connecter, utilisateur, deconnecter } = useSession()
  const [liste, setListe] = useState<{ id: string; nom: string; role: string }[]>([])
  const [choisi, setChoisi] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    void base.utilisateurs.toArray().then((tous) =>
      setListe(tous.filter((u) => u.actif).map((u) => ({ id: u.id, nom: u.nom, role: u.role }))),
    )
  }, [])

  async function tenter(id: string) {
    const ok = await connecter(id, code)
    if (!ok) setErreur('Code incorrect.')
    setCode('')
  }

  function chiffre(c: string) {
    setErreur(null)
    if (code.length >= 4) return
    setCode((v) => v + c)
  }

  return (
    <div className="ecran ecran--connexion">
      <div className="connexion">
        <div className="connexion__marque">
          <Icone nom="capsule" taille={30} />
          <span>Gestmalin</span>
        </div>

        {utilisateur ? (
          <>
            <p className="connexion__qui">Connectée : <strong>{utilisateur.nom}</strong></p>
            <button className="btn btn--secondaire btn--large btn--plein" onClick={deconnecter}>
              Changer de personne
            </button>
          </>
        ) : liste.length <= 1 ? (
          <>
            <p className="connexion__titre">Code</p>
            <p className="connexion__indices">{liste[0]?.nom ?? 'Préparateur'}</p>
            <div className="pastilles">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`pastille-point${code.length > i ? ' pastille-point--plein' : ''}`} />
              ))}
            </div>
            <PavillonNumerique onChiffre={chiffre} onValider={() => liste[0] && void tenter(liste[0].id)} />
            {erreur && <p className="connexion__erreur">{erreur}</p>}
          </>
        ) : (
          <>
            <p className="connexion__titre">Qui est-ce ?</p>
            <div className="colonne">
              {liste.map((u) => (
                <button
                  key={u.id}
                  className={choisi === u.id ? 'personne personne--choisie' : 'personne'}
                  onClick={() => { setChoisi(u.id); setCode(''); setErreur(null) }}
                >
                  <Icone nom="capsule" taille={20} />
                  <span>{u.nom}</span>
                </button>
              ))}
            </div>
            {choisi && (
              <>
                <div className="pastilles">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`pastille-point${code.length > i ? ' pastille-point--plein' : ''}`} />
                  ))}
                </div>
                <PavillonNumerique onChiffre={chiffre} onValider={() => void tenter(choisi)} />
                <button className="btn btn--discret btn--plein" onClick={() => setChoisi(null)}>Retour</button>
              </>
            )}
            {erreur && <p className="connexion__erreur">{erreur}</p>}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Le pave numerique ---------- */

function PavillonNumerique({ onChiffre, onValider }: { onChiffre: (c: string) => void; onValider: () => void }) {
  return (
    <div className="pave">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button key={n} className="pave__touche" onClick={() => onChiffre(String(n))}>{n}</button>
      ))}
      <button className="pave__touche pave__touche--muet" onClick={() => onChiffre('0')}>0</button>
      <button
        className="pave__touche pave__touche--valider"
        onClick={onValider}
        aria-label="Valider"
      >
        <Icone nom="retour" taille={22} />
      </button>
    </div>
  )
}