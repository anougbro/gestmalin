import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { LONGUEUR_CODE, LONGUEUR_TELEPHONE, estBloque, normaliserTelephone, telephoneSaisi, type Utilisateur } from '../domaine/acces'
import { noterEssaiRate } from '../donnees/personnes'
import { Icone } from './Icones'
import { NumeroAffiche, PastillesCode, PavillonNumerique } from './Primitives'

/* ============================================================
   LA CONNEXION

   Son numero, puis son code. Deux tapes, sans liste a faire
   defiler.

   On ne demande PAS le nom : il est affiche quand le code est
   bon, et le demander avant servirait a rien. Le nom, personne ne
   le retient — c'est justement pour ca que le numero existe.

   LA LISTE DES NOMS N'A PAS DISPARU. Elle est la, derriere un
   bouton discret, pour deux raisons :

   - les comptes anterieurs a cette regle n'ont pas de numero ;
   - dix chiffres, ca s'oublie. Etre bloque dehors un samedi
     matin, devant une pharmacie qui ne peut plus dire ce qu'elle
     a en rayon, n'est pas un detail.

   Le mot « oublie » est donc deux fois sur la meme idee : ce que
   la personne a perdu, c'est une information — pas son acces.
   ============================================================ */

type Etape = 'numero' | 'code' | 'noms'

export function EcranConnexion({ surCreation }: { surCreation: () => void }) {
  const { connecter } = useSession()
  const [etape, setEtape] = useState<Etape>('numero')

  /* Les comptes entiers, pas seulement le nom affiche : le numero
     doit etre recherche ICI, a l entree, pour savoir s il existe
     avant de demander un code.

     Chercher le compte apres coup — c est a dire tenter la
     connexion avec un code vide — afficherait « code incorrect »
     alors que la personne n en a pas encore tape. Elle
     recommencerait son code cinq fois. */
  const [comptes, setComptes] = useState<Utilisateur[]>([])

  const [numero, setNumero] = useState('')
  const [choisi, setChoisi] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const liste = comptes
    .filter((u) => u.actif)
    .map((u) => ({ id: u.id, nom: u.nom, role: u.role }))

  const recharger = () => base.utilisateurs.toArray().then(setComptes)

  useEffect(() => { void recharger() }, [])

  /* ---------- Etape 1 : ce numero est-il connu ? ---------- */

  function chercherParNumero() {
    setErreur(null)
    const voulu = normaliserTelephone(numero)
    const trouves = comptes.filter((u) => u.telephone && normaliserTelephone(u.telephone) === voulu)

    if (trouves.length === 0) {
      setErreur('Login inconnu.')
      return
    }
    if (trouves.length > 1) {
      /* Deux comptes pour un numero : on ne sait pas lequel
         ouvrir, et choisir le premier reviendrait a laisser le
         code de l un ouvrir le mauvais rayon. */
      setErreur('Ce login est utilisé deux fois. Demande à un responsable.')
      return
    }
    if (estBloque(trouves[0])) {
      setErreur('Compte bloqué. Demande à un responsable.')
      return
    }
    setChoisi(trouves[0].id)
    setEtape('code')
  }

  /* ---------- Etape 2 : le code ---------- */

  async function tenter(id: string) {
    try {
      const r = await connecter(id, code)
      if (r.ok) { setErreur(null); return }

      if (r.raison === 'code-incorrect') {
        const { bloque, restants } = await noterEssaiRate(id)
        await recharger()
        /* Un essai rate se dit, et se compte. Sans le nombre, la
           personne recommence a l'aveugle jusqu'au blocage sans
           comprendre qu'elle y arrive. */
        setErreur(
          bloque
            ? 'Compte bloqué. Demande à un responsable.'
            : `Mot de passe incorrect. Encore ${restants} essai${restants > 1 ? 's' : ''}.`,
        )
        return
      }

      if (r.raison === 'bloque') { setErreur('Compte bloqué. Demande à un responsable.'); return }
      if (r.raison === 'inactif') { setErreur('Ce compte est désactivé.'); return }
      setErreur('Mot de passe incorrect.')
    } catch {
      setErreur('Connexion impossible. Réessaie.')
    } finally {
      setCode('')
    }
  }

  /* ---------- Chiffres ---------- */

  function chiffreNumero(c: string) {
    setErreur(null)
    if (numero.length >= LONGUEUR_TELEPHONE) return
    const suivant = numero + c
    setNumero(suivant)
    /* Des que le numero est complet, on cherche la personne. Pas
       de bouton a presser : il n'y a rien a choisir, et un
       bouton « Suivant » ne ferait qu'ajouter une erreur de
       frappe possible. */
  }

  function chiffreCode(c: string) {
    setErreur(null)
    /* Le garde est DANS la mise a jour fonctionnelle, pas a cote.

       A cote, il lit `code` dans la closure du rendu courant. Deux
       appuis rapproches arrivent avant le prochain rendu : le
       deuxieme voit une valeur perimee, et un chiffre se perd —
       l'ecran affiche un code de quatre chiffres quand la personne
       en a tape cinq, sans aucune raison visible.

       C'est un bug de frappe, pas de lecture : on tape vite. */
    setCode((v) => (v.length >= LONGUEUR_CODE ? v : v + c))
  }

  function effacer() {
    setErreur(null)
    if (etape === 'code') setCode((v) => v.slice(0, -1))
    else setNumero((v) => v.slice(0, -1))
  }

  function toutEffacer() {
    setErreur(null)
    setCode('')
    if (etape === 'numero') setNumero('')
  }

  /* Sur ordinateur, on tape au clavier : chiffres, retour
     arriere, entree. C'est plus rapide que viser trois touches,
     et ca evite les erreurs de frappe au doigt. */
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        /* Une touche du pave garde le focus apres avoir ete
           touchee. Sans cet empirement, « Entrer » au clavier
           declenche la DERNIERE touche touchee au doigt. */
        e.preventDefault()
        if (etape === 'numero' && telephoneSaisi(numero)) chercherParNumero()
        else if (etape === 'code' && code.length === LONGUEUR_CODE && choisi) void tenter(choisi)
        return
      }

      if (e.key >= '0' && e.key <= '9') {
        if (etape === 'code') chiffreCode(e.key)
        else if (etape === 'numero') chiffreNumero(e.key)
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

  const enCode = etape === 'code' && choisi

  return (
    <div className="ecran ecran--connexion">
      <div className="connexion">
        <div className="connexion__marque">
          <Icone nom="capsule" taille={30} />
          <span>Gestmalin</span>
        </div>

        {/* ---------- Etape 1 : le login ---------- */}
        {etape === 'numero' && (
          <>
            <p className="connexion__titre">Login</p>
            <NumeroAffiche numero={numero} />
            <PavillonNumerique
              onChiffre={chiffreNumero}
              onEffacer={effacer}
              onValider={chercherParNumero}
              peutValider={telephoneSaisi(numero)}
            />
            {erreur && <p className="connexion__erreur">{erreur}</p>}
            <button className="btn btn--discret" style={{ color: 'rgba(255,255,255,.55)', minHeight: 40 }} onClick={() => { setEtape('noms'); setErreur(null) }}>
              J’ai oublié mon login
            </button>
          </>
        )}

        {/* ---------- Etape 2 : le mot de passe ---------- */}
        {enCode && (
          <>
            <p className="connexion__titre">Mot de passe</p>
            <p className="connexion__indices">
              {liste.find((u) => u.id === choisi)?.nom ?? ''}
            </p>
            <PastillesCode code={code} />
            <PavillonNumerique
              onChiffre={chiffreCode}
              onEffacer={effacer}
              onValider={() => void tenter(choisi!)}
              peutValider={code.length === LONGUEUR_CODE}
            />
            {erreur && <p className="connexion__erreur">{erreur}</p>}
            <button
              className="btn btn--discret"
              style={{ color: 'rgba(255,255,255,.7)' }}
              onClick={() => {
                /* Retour depuis le mot de passe : on revient au
                   login VIDE. Le garder plein serait un piege —
                   le pave refuse alors tout nouveau chiffre sans
                   rien dire, et la personne croit que le telephone
                   ne repond plus. */
                if (numero) { setNumero(''); setEtape('numero') }
                else setEtape('noms')
                setCode('')
                setErreur(null)
              }}
            >
              Retour
            </button>
          </>
        )}

        {/* ---------- Secours : la liste des noms ---------- */}
        {etape === 'noms' && (
          <>
            <p className="connexion__titre">Qui est-ce&nbsp;?</p>
            <div className="colonne" style={{ width: '100%' }}>
              {liste.map((u) => (
                <button key={u.id} className="personne" onClick={() => { setChoisi(u.id); setEtape('code'); setErreur(null) }}>
                  <Icone nom="capsule" taille={20} />
                  <span>{u.nom}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn--discret"
              style={{ color: 'rgba(255,255,255,.7)' }}
              onClick={() => {
                if (numero) { setNumero(''); setEtape('numero') }
                else setEtape('code')
                setErreur(null)
              }}
            >
              Retour
            </button>
          </>
        )}

        {/* ---------- Mot de passe oublie ----------

            Il n'y a plus de bouton de reinitialisation ici. Il en
            existait un : il remettait le meme mot de passe a tout le
            monde, sans rien demander. Avec un blocage apres cinq
            essais, ce bouton aurait ete la contournement : essayez
            cinq fois, appuyez, entrez. Le directeur debloque
            desormais depuis les reglages, et le blocage expire seul
            au bout d'un quart d'heure. */}
        {etape !== 'noms' && (
          <p style={{ margin: 0, color: 'rgba(255,255,255,.45)', fontSize: 12.5 }}>
            Mot de passe oublié ? Demande à un responsable.
          </p>
        )}

        {/* ---------- Creer son compte ----------

            La deuxieme personne — celle des menagers — n attend
            pas que la premiere lui prepare une place. Elle ouvre
            l application, elle cree son compte, elle est
            prete. Aucun acces n est accorde a l'avance, et donc
            aucun n est a demander. */}
        <button
          className="btn btn--discret"
          style={{ color: 'rgba(255,255,255,.55)', minHeight: 44 }}
          onClick={surCreation}
        >
          Créer mon compte
        </button>
      </div>
    </div>
  )
}
