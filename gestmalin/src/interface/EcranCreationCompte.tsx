import { useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { LONGUEUR_CODE, LONGUEUR_TELEPHONE, empreinte, mailLibre, mailValide, normaliserTelephone, numeroLibre, telephoneSaisi } from '../domaine/acces'
import { nouvelId } from '../donnees/depots'
import { Icone } from './Icones'
import { Bouton, NumeroAffiche, PastillesCode, PavillonNumerique } from './Primitives'

/* ============================================================
   CREER SON COMPTE

   Une personne sur deux. La pharmacie ouvre l'application et cree
   le sien. Quand le gestmalinier est la, il ouvre a son tour et
   cree le sien. Personne n'attend personne.

   C etait l autre choix — creer les deux d un coup — et il est
   meilleur pour une equipe presente chaque jour, pire des que
   l un des deux manque : la seconde personne arrive alors devant
   un telephone ou son rayon n existe pas, et elle en conclut que
   l application est cassee.

   Trois ecrans, une question chacun. Jamais quatre champs a la
   fois : c est la regle de tout le projet, et c est une regle de
   lisibilite, pas de commodite.

   Le premier compte cree sur ce telephone est DIRECTEUR. Les
   suivants sont preparateurs. C est la seule facon d avoir un
   chef sans mot de passe de chef connu de tous : celui qui arrive
   le premier commande, et il peut ensuite debloquer les autres.
   ============================================================ */

type Etape = 'nom' | 'rayon' | 'numero' | 'code' | 'mail'

export function EcranCreationCompte({ surFin }: { surFin: () => void }) {
  const { connecter } = useSession()
  const [etape, setEtape] = useState<Etape>('nom')

  const [nom, setNom] = useState('')
  const [rayonId, setRayonId] = useState('')
  const [numero, setNumero] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [mail, setMail] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  async function enregistrerCompte(passer = false) {
    setErreur(null)
    const tous = await base.utilisateurs.toArray()
    const adresse = passer ? '' : mail.trim()

    if (!nom.trim()) return setErreur('Écris ton nom.')
    if (!rayonId) return setErreur('Choisis ton rayon.')
    if (!telephoneSaisi(numero)) return setErreur(`Ton numéro doit faire ${LONGUEUR_TELEPHONE} chiffres.`)
    if (code.length !== LONGUEUR_CODE) return setErreur(`Ton mot de passe doit faire ${LONGUEUR_CODE} chiffres.`)
    if (adresse && !mailValide(adresse)) return setErreur('Ce courriel ne va pas. Écris-le en entier, ou passe.')

    /* Un courriel par personne, comme un numero. Deux comptes sur
       la meme adresse et le responsable ne sait plus qui joindre. */
    if (adresse && !mailLibre(tous, adresse)) {
      return setErreur('Ce courriel est déjà pris. Écris-en un autre, ou passe.')
    }

    /* L'unicite se verifie AU MOMENT ou l'on enregistre, pas
       pendant la frappe : le numero tape au clavier peut changer
       entre le moment ou l'on le controle et celui ou l'on
       valide, et c'est la validation qui doit faire foi. */
    if (!numeroLibre(tous, numero)) {
      setErreur('Ce numéro est déjà pris.')
      setEtape('numero')
      setNumero('')
      return
    }

    setEnregistrement(true)
    const id = nouvelId()

    await base.utilisateurs.put({
      id,
      nom: nom.trim(),
      /* Le premier arrive commande. Sans cela, un telephone neuf
         n'a que des preparateurs : personne ne peut debloquer
         personne, ni transferer un rayon. */
      role: tous.length === 0 ? 'directeur' : 'preparateur',
      rayonsAutorises: [rayonId],
      actif: true,
      independant: true,
      telephone: normaliserTelephone(numero),
      longueurCode: LONGUEUR_CODE,
      ...(adresse ? { mail: adresse } : {}),
      empreinte: empreinte(id, code),
    })

    /* On entre directement. Faire retaper dix chiffres et cinq
       autres juste apres les avoir choisis, c'est l'endroit ou
       l'on se trompe — et la personne croirait que son compte
       neuf ne marche pas. */
    await connecter(id, code)
    onFinished()
  }

  function onFinished() {
    setEnregistrement(false)
    surFin()
  }

  function chiffreCode(c: string) {
    setErreur(null)
    setCode((v) => (v.length >= LONGUEUR_CODE ? v : v + c))
  }
  function chiffreNumero(c: string) {
    setErreur(null)
    if (numero.length >= LONGUEUR_TELEPHONE) return
    setNumero(numero + c)
  }
  function effacer() {
    setErreur(null)
    if (confirmation !== null) setConfirmation((v) => (v ?? '').slice(0, -1))
    else if (etape === 'code') setCode((v) => v.slice(0, -1))
    else if (etape === 'numero') setNumero((v) => v.slice(0, -1))
  }
  function toutEffacer() {
    setErreur(null)
    setConfirmation(null)
    setCode('')
  }

  /* ---------- 1. Ton nom ---------- */
  if (etape === 'nom') {
    return (
      <div className="ecran">
        <div className="contenu">
          <p className="section__titre">Ton nom</p>
          <input
            className="champ__saisie"
            value={nom}
            onChange={(e) => { setNom(e.target.value); setErreur(null) }}
            placeholder="Amina"
            autoFocus
          />
          {erreur && <p className="connexion__erreur" style={{ color: 'var(--dgr-700)' }}>{erreur}</p>}
          <Bouton taille={64} plein surClick={() => setEtape('rayon')} disabled={!nom.trim()}>Suivant</Bouton>
        </div>
      </div>
    )
  }

  /* ---------- 2. Ton rayon ---------- */
  if (etape === 'rayon') {
    return (
      <div className="ecran">
        <div className="contenu">
          <p className="section__titre">Ton rayon</p>
          <div className="liste">
            {RAYONS_PAR_DEFAUT.map((r) => (
              <button
                key={r.id}
                className="ligne"
                style={{ minHeight: 72 }}
                onClick={() => { setRayonId(r.id); setEtape('numero') }}
              >
                <span className="destination" style={{ background: r.ton === 'teal' ? 'var(--teal-700)' : 'var(--c-300)' }}>
                  <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={22} />
                </span>
                <span className="ligne__corps"><span className="ligne__titre">{r.nom}</span></span>
              </button>
            ))}
          </div>
          <button className="btn btn--discret btn--plein" onClick={() => setEtape('nom')}>Retour</button>
        </div>
      </div>
    )
  }

  /* ---------- 3. Ton numéro ---------- */
  if (etape === 'numero') {
    return (
      <div className="ecran">
        <div className="contenu">
          <p className="section__titre">Ton numéro</p>
          <NumeroAffiche numero={numero} sur="clair" />
          <PavillonNumerique
            ton="clair"
            onChiffre={chiffreNumero}
            onEffacer={effacer}
            onValider={() => { if (telephoneSaisi(numero)) setEtape('code') }}
            peutValider={telephoneSaisi(numero)}
          />
          {erreur && <p className="connexion__erreur" style={{ color: 'var(--dgr-700)' }}>{erreur}</p>}
          <button className="btn btn--discret btn--plein" onClick={() => setEtape('rayon')}>Retour</button>
        </div>
      </div>
    )
  }

  /* ---------- 4. Ton mot de passe, deux fois ---------- */
  if (etape === 'code') {
  return (
    <div className="ecran">
      <div className="contenu">
        <p className="section__titre">{confirmation === null ? 'Ton mot de passe' : 'Répète ton mot de passe'}</p>
        <PastillesCode code={confirmation ?? code} sur="clair" />
        <PavillonNumerique
          ton="clair"
          onChiffre={(c) => {
            if (confirmation === null) chiffreCode(c)
            else {
              setErreur(null)
              setConfirmation((v) => (v!.length >= LONGUEUR_CODE ? v! : v! + c))
            }
          }}
          onEffacer={effacer}
          onValider={() => {
            if (confirmation === null) {
              if (code.length === LONGUEUR_CODE) { setConfirmation(''); setErreur(null) }
              return
            }
            if (confirmation !== code) {
              /* Deux saisies differentes : on ne suppose pas que
                 la premiere est la bonne. On repart de zero, et on
                 le dit — sinon la personne ne sait pas laquelle
                 des deux compte. */
              setConfirmation(null)
              setCode('')
              setErreur('Les deux mots de passe ne sont pas pareils.')
              return
            }
            /* Le mot de passe est bon. On ne cree pas encore le
               compte : le courriel se demande avant, et il faut
               pouvoir repondre « passer » sans perdre la saisie. */
            setErreur(null)
            setEtape('mail')
          }}
          peutValider={(confirmation ?? code).length === LONGUEUR_CODE}
        />
        {erreur && <p className="connexion__erreur" style={{ color: 'var(--dgr-700)' }}>{erreur}</p>}
        <button className="btn btn--discret btn--plein" onClick={() => { toutEffacer(); setEtape('numero') }}>Retour</button>
      </div>
    </div>
  )
  }

  /* ---------- 5. Ton courriel ----------

     Facultatif, et on le dit deux fois : le titre, puis le bouton
     « Passer » aussi gros que « Terminer ». Beaucoup de personnes
     n'ont pas de boite aux lettres, et l'application n'envoie rien
     de toute facon : c'est un moyen de les joindre, pas une porte. */
  return (
    <div className="ecran">
      <div className="contenu">
        <p className="section__titre">Ton courriel</p>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--c-500)' }}>
          Facultatif — pour te joindre.
        </p>
        <input
          className="champ__saisie"
          style={{ width: '100%' }}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={mail}
          placeholder="amina@exemple.com"
          autoFocus
          onChange={(e) => { setMail(e.target.value); setErreur(null) }}
        />
        {erreur && <p className="connexion__erreur" style={{ color: 'var(--dgr-700)' }}>{erreur}</p>}
        {enregistrement && <p style={{ color: 'var(--c-500)', fontSize: 13 }}>Un instant…</p>}
        <Bouton
          taille={64}
          plein
          disabled={enregistrement || (mail.trim() !== '' && !mailValide(mail))}
          surClick={() => void enregistrerCompte()}
        >
          Terminer
        </Bouton>
        <button
          className="btn btn--discret btn--plein"
          style={{ minHeight: 56 }}
          disabled={enregistrement}
          onClick={() => void enregistrerCompte(true)}
        >
          Passer
        </button>
      </div>
    </div>
  )
}