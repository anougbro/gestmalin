import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import { changerMail, changerNumero, debloquer, deplacerVersRayon } from '../donnees/personnes'
import { aLeDroit, estBloque, LONGUEUR_TELEPHONE, mailValide, telephoneSaisi, type Utilisateur } from '../domaine/acces'
import { CODE_PAR_DEFAUT } from '../etat/preparation'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { chargerJeuEssai, chargerPersonnes, COMPTES_ESSAI } from '../donnees/jeuEssai'
import { empreinte, LONGUEUR_CODE } from '../domaine/acces'
import { Icone } from './Icones'
import { Bouton, Entete, NumeroAffiche, PastillesCode, PavillonNumerique } from './Primitives'
import { useInstallation } from '../etat/installation'

/* ============================================================
   LES REGLAGES

   L'ecran qu'on ouvre rarement, et qui doit etre clair quand
   on l'ouvre : changer son code, charger un jeu d'essai, tout
   effacer.
   ============================================================ */

/* Le role est un code en base (`preparateur`), pas un nom
   affichable. Sans cette table, l'ecran montrerait « preparateur »
   sans accent, au milieu d'un texte francais. */
const NOM_ROLE: Record<Utilisateur['role'], string> = {
  preparateur: 'Préparateur',
  responsable: 'Responsable',
  pharmacien: 'Pharmacien',
  directeur: 'Directeur',
}

export function EcranReglages({ retour }: { retour: () => void }) {
  const { utilisateur, rafraichir, toutEffacer: vider } = useSession()
  const [message, setMessage] = useState<string | null>(null)
  const { proposee, installee, installer } = useInstallation()

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
      setErreurCode('Les deux mots de passe ne sont pas pareils. Recommence.')
      setPremier(null)
      setCode('')
      return
    }

    void (async () => {
      await base.utilisateurs.put({ ...utilisateur, longueurCode: LONGUEUR_CODE, empreinte: empreinte(utilisateur.id, code) })
      setMessage(`Mot de passe changé. Le nouveau mot de passe est pris en compte dès la prochaine connexion.`)
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
    const r = await chargerJeuEssai(utilisateur?.id ?? 'u-1')
    await chargerPersonnes()
    setMessage(`${r.produits} produits et ${r.mouvements} mouvements chargés.`)
    await rafraichir()
  }

  /* Remettre les comptes de l'essai a leurs codes annonces.
     Utile quand la base a ete reparee apres un changement de
     longueur : tout le monde est alors passe a 00000, et la
     liste ci-dessus ne dit plus vrai. */
  async function remettreLesComptes() {
    await chargerPersonnes()
    setMessage('Les mots de passe de l\'essai sont remis.')
    await rafraichir()
  }

  /* ---------- Qui gere quel rayon ---------- */

const [personnes, setPersonnes] = useState<Utilisateur[]>([])

/* Se seul `directeur` deplace quelqu'un. C'est le meme droit que
   la gestion des comptes : celui qui gere les personnes gere aussi
   ou elles travaillent. Deux droits pour une seule idee. */
const peutGererRayons = utilisateur ? aLeDroit(utilisateur.role, 'utilisateurs') : false

async function lirePersonnes() {
  setPersonnes(await base.utilisateurs.toArray())
}

useEffect(() => {
  void lirePersonnes()
}, [])

async function transferer(id: string, rayonId: string) {
  const refus = await deplacerVersRayon(id, rayonId, utilisateur)
  if (refus) {
    setMessage(refus)
    await lirePersonnes()
    return
  }
  await lirePersonnes()
  await rafraichir()
  setMessage('Rayon changé.')
}

/* ---------- Debloquer, et remettre un mot de passe ----------

   Deux gestes distincts, parce qu'ils ne repondent pas a la meme
   situation. Debloquer rend la porte a quelqu'un qui se souvient
   de son mot de passe. Remettre 00000 rend la porte a quelqu'un
   qui l'a oublie — et il changera son mot de passe aussitot.

   Les deux sont reserves au directeur par `debloquer()` elle-meme,
   pas seulement par le bouton : un bouton cache n'est pas une
   interdiction. */
async function debloquerPersonne(id: string) {
  const refus = await debloquer(id, utilisateur)
  setMessage(refus ?? 'Compte débloqué.')
  await lirePersonnes()
}

async function remettreMotDePasse(id: string) {
  const refus = await debloquer(id, utilisateur, CODE_PAR_DEFAUT)
  setMessage(refus ?? `Mot de passe remis à ${CODE_PAR_DEFAUT}. La personne le change à la prochaine entrée.`)
  await lirePersonnes()
}

/* ---------- Mon numero ---------- */

const [numero, setNumero] = useState('')
const [erreurNumero, setErreurNumero] = useState<string | null>(null)
const [numeroOuvert, setNumeroOuvert] = useState(false)

const [mail, setMail] = useState(utilisateur?.mail ?? '')
const [erreurMail, setErreurMail] = useState<string | null>(null)

async function enregistrerMail() {
  if (!utilisateur) return
  if (mail.trim() && !mailValide(mail)) {
    setErreurMail('Ce courriel ne va pas. Écris-le en entier, ou vide le champ.')
    return
  }
  const r = await changerMail(utilisateur.id, mail)
  if (r) {
    setErreurMail(r)
    return
  }
  setErreurMail(null)
  setMessage(mail.trim() ? 'Courriel enregistré.' : 'Courriel effacé.')
  await rafraichir()
  await lirePersonnes()
}

async function validerNumero() {
  if (!utilisateur) return
  if (!telephoneSaisi(numero)) {
    setErreurNumero(`Le numéro doit faire ${LONGUEUR_TELEPHONE} chiffres.`)
    return
  }
  const r = await changerNumero(utilisateur.id, numero)
  if (!r.ok) {
    setErreurNumero(r.raison)
    setNumero('')
    return
  }
  setErreurNumero(null)
  setNumero('')
  setNumeroOuvert(false)
  setMessage('Numéro changé. Il te faut l\'entrer à la prochaine connexion.')
  await lirePersonnes()
}

/* ---------- L'ecran du numero ----------

    Un pave, une question. Le meme ecran que la connexion, sans la
    marque : dix chiffres, puis on revient aux reglages.

    Il n'est pas melange a l'ecran des reglages parce qu'un pave
    qui ne sert qu'a une chose doit etre seul avec cette chose. */
if (numeroOuvert) {
  return (
    <div className="ecran">
      <Entete titre="Mon numéro" surRetour={() => { setNumeroOuvert(false); setNumero(''); setErreurNumero(null) }} />

      <div className="contenu">
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-500)' }}>
          Dix chiffres, sans l’indicatif du pays.
        </p>

        <NumeroAffiche numero={numero} sur="clair" />
        <PavillonNumerique
          ton="clair"
          onChiffre={(c) => {
            setErreurNumero(null)
            setNumero((v) => (v.length >= LONGUEUR_TELEPHONE ? v : v + c))
          }}
          onEffacer={() => { setErreurNumero(null); setNumero((v) => v.slice(0, -1)) }}
          onValider={() => void validerNumero()}
          peutValider={telephoneSaisi(numero)}
          libelleValider="Enregistrer"
        />
        {erreurNumero && <p className="reglage__erreur">{erreurNumero}</p>}
      </div>
    </div>
  )
}

async function effacerTout() {
    if (!confirm('Effacer TOUT : produits, lots, mouvements, alertes ?\n\nCette action est définitive.')) return
    await vider()
    await chargerPersonnes()
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

        {/* ---------- Mon numéro ----------

            Le numéro EST l'identite : c'est par lui qu'on entre.
            On le montre en clair, en gros, pour que la personne
            le verifie d'un coup d'oeil — un numero mal recopie
            par ailleurs est la cause la plus probable d'un
            « je n'arrive pas a entrer ». */}
        <div className="carte">
          <p className="section__titre">Mon numéro</p>
          <p className="num" style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700, letterSpacing: '0.02em' }}>
            {utilisateur?.telephone ?? '—'}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--c-500)' }}>
            {utilisateur?.telephone
              ? 'Tu entres avec ce numéro, puis ton mot de passe.'
              : 'Pas encore de numéro. Ajoute-le : sans lui, tu entres par ton nom.'}
          </p>

          {/* Le pave du numero vit sur SON ecran, pas ici. Deux
              paves identiques l'un sous l'autre, c'est deux fois le
              meme dessin avec deux sens differents : personne ne
              sait lequel remplit quoi. */}
          <Bouton surClick={() => { setNumero(''); setErreurNumero(null); setNumeroOuvert(true) }}>
            {utilisateur?.telephone ? 'Changer mon numéro' : 'Ajouter mon numéro'}
          </Bouton>
        </div>

        {/* ---------- Mon courriel ----------

            Facultatif. L'application ne l'envoie jamais : elle n'a
            pas de serveur. Il sert a joindre la personne quand elle
            oublie son mot de passe — c'est le directeur qui le lit
            dans la liste des personnes, pas un service exterieur. */}
        <div className="carte">
          <p className="section__titre">Mon courriel</p>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--c-500)' }}>
            Facultatif — aucun courriel ne part.
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
            aria-label="Mon courriel"
            onChange={(e) => { setMail(e.target.value); setErreurMail(null) }}
          />
          {erreurMail && <p className="reglage__erreur">{erreurMail}</p>}
          <div style={{ marginTop: 10 }}>
            <Bouton
              variante="secondaire"
              disabled={!!utilisateur && mail.trim() === (utilisateur.mail ?? '')}
              surClick={() => void enregistrerMail()}
            >
              Enregistrer mon courriel
            </Bouton>
          </div>
        </div>

        {/* ---------- Mon mot de passe ---------- */}
        <div className="carte">
          <p className="section__titre">Mon mot de passe</p>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--c-700)' }}>
            {utilisateur ? `${utilisateur.nom} - ${NOM_ROLE[utilisateur.role]}` : ''}
          </p>

          <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--c-500)' }}>
            {enConfirmation
              ? 'Tape le même mot de passe encore une fois'
              : `Choisis un nouveau mot de passe de ${LONGUEUR_CODE} chiffres`}
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
                Le mot de passe n'est jamais écrit en clair, seulement son empreinte.
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
          <p className="section__titre">Personnes et mots de passe</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Les mots de passe de l'essai. Ils ne sont jamais stockés en clair
            dans l'application : elle ne compare que des empreintes.
          </p>
          <ul className="codes" data-liste="comptes">
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
              Remettre les mots de passe de l'essai
            </Bouton>
          </div>
        </div>

        {/* ---------- Qui gere quel rayon ----------

            La regle tient en une ligne : une personne n'ouvre que
            ses rayons. Elle ne peut pas changer, et elle ne voit
            meme pas les autres.

            Ce bloc sert a la surveillance et au depannage, pas a la
            liberation : sans lui, un transfert de poste se ferait
            en vidant la base. */}
        <div className="carte">
          <p className="section__titre">Les personnes</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Ce téléphone ne montre que les rayons de la personne.
          </p>

          <ul className="codes" data-liste="rayons">
            {personnes.map((p) => (
              <li key={p.id} className="codes__ligne" style={{ cursor: 'default' }}>
                <span className="codes__nom" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <span>{p.nom}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--c-500)', fontWeight: 500 }}>
                    {p.mail ?? 'Pas de courriel'}
                  </span>
                </span>
                <span
                  className="codes__peut"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}
                >
                  {estBloque(p) && (
                    <span style={{ color: 'var(--dgr-700)', fontWeight: 700 }}>Bloqué</span>
                  )}
                  {p.telephone ? (
                    <span className="num">{p.telephone}</span>
                  ) : (
                    <span style={{ color: 'var(--wrn-700)' }}>Pas de numéro</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* Debloquer et remettre un mot de passe. Deux boutons par
              personne, parce qu'on ne repare pas de la meme facon
              quelqu'un qui a oublie son mot de passe et quelqu'un
              qui s'est trompe cinq fois. */}
          {peutGererRayons && (
            <div style={{ marginTop: 16 }}>
              <p className="section__titre" style={{ margin: '0 0 8px' }}>Débloquer</p>
              <div className="colonne" style={{ gap: 8 }}>
                {personnes.map((p) => (
                  <div
                    key={p.id}
                    data-personne={p.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      paddingBottom: 10,
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.nom}</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {estBloque(p) && (
                        <Bouton variante="secondaire" surClick={() => void debloquerPersonne(p.id)}>
                          Débloquer
                        </Bouton>
                      )}
                      <Bouton variante="secondaire" surClick={() => void remettreMotDePasse(p.id)}>
                        Remettre {CODE_PAR_DEFAUT}
                      </Bouton>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--c-500)' }}>
                {CODE_PAR_DEFAUT} est un mot de passe provisoire : la personne le change
                dès qu'elle entre.
              </p>
            </div>
          )}

          {peutGererRayons && (
            <div style={{ marginTop: 14 }}>
              <p className="section__titre" style={{ margin: '0 0 8px' }}>Transférer</p>
              <div className="grille-2">
                {personnes.map((p) => (
                  <select
                    key={p.id}
                    className="champ__saisie"
                    value={p.rayonsAutorises[0] ?? ''}
                    aria-label={`Rayon de ${p.nom}`}
                    onChange={(e) => void transferer(p.id, e.target.value)}
                  >
                    {RAYONS_PAR_DEFAUT.map((r) => (
                      <option key={r.id} value={r.id}>{r.nom}</option>
                    ))}
                  </select>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--c-500)' }}>
                Transférer quelqu'un vers un rayon qu'il ne gère pas ici ne
                l'efface pas : cela retire simplement son accès.
              </p>
            </div>
          )}
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

        {/* ---------- Installer sur le telephone ----------

            Une application installee s'ouvre d'un doigt et demarre
            sans reseau. Dans un onglet, il faut retrouver l'adresse
            chaque fois — et le stock est pourtant deja sur le
            telephone. On propose donc l'installation ici, avec le
            bouton du navigateur quand il le donne, et le chemin du
            menu sinon. Jamais de banniere qui surgit : elle
            interrompt une reception. */}
        <div
          className="carte"
          data-installation={installee ? 'installee' : proposee ? 'proposee' : 'manuelle'}
        >
          <p className="section__titre">Installer</p>
          {installee ? (
            <div className="rangee" style={{ gap: 10, color: 'var(--c-600)', fontSize: 13.5 }}>
              <Icone nom="coche" taille={20} />
              <span>Déjà installée.</span>
            </div>
          ) : proposee ? (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
                Sur l'écran d'accueil.
              </p>
              <Bouton icone="telephone" surClick={() => void installer()}>
                Installer
              </Bouton>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-600)' }}>
              Menu du navigateur, puis « Installer ».
            </p>
          )}
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
