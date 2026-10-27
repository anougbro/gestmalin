import { useEffect, useState } from 'react'
import { useSession } from '../etat/useSession'
import { base } from '../donnees/base'
import {
  autoriser, bloquer, changerMail, changerNumero, debloquer,
  deplacerVersRayon, supprimer, supprimerTousLesComptes,
} from '../donnees/personnes'
import { effacerStock } from '../donnees/depots'
import {
  aLeDroit, empreinte, etatCompte, LONGUEUR_CODE,
  LONGUEUR_TELEPHONE, mailValide, telephoneSaisi,
  type EtatCompte, type Utilisateur,
} from '../domaine/acces'
import { CODE_PAR_DEFAUT } from '../etat/preparation'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { Icone } from './Icones'
import { Bouton, Entete, NumeroAffiche, PastillesCode, PavillonNumerique } from './Primitives'
import { useInstallation } from '../etat/installation'

/* ============================================================
   LES REGLAGES

   L'ecran qu'on ouvre rarement, et qui doit etre clair quand
   on l'ouvre : changer son code, gerer les comptes, effacer le
   stock.
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

/* Un mot par etat, pas une phrase. La couleur suffit a distinguer
   « en attente » de « bloque » quand on lit mal. */
const NOM_ETAT: Record<EtatCompte, string> = {
  actif: 'Actif',
  en_attente: 'En attente',
  bloque: 'Bloqué',
}

export function EcranReglages({ retour }: { retour: () => void }) {
  const { utilisateur, rafraichir, deconnecter } = useSession()
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

  /* ---------- Qui gere quel rayon ---------- */

const [personnes, setPersonnes] = useState<Utilisateur[]>([])
const [suppression, setSuppression] = useState<string | null>(null)
const [confirmerComptes, setConfirmerComptes] = useState(false)
const [confirmerStock, setConfirmerStock] = useState(false)

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
   situation. Autoriser rend la porte a quelqu'un qui se souvient
   de son mot de passe. Remettre 00000 rend la porte a quelqu'un
   qui l'a oublie — et il changera son mot de passe aussitot.

   Les deux sont reserves au directeur par les fonctions
   elles-memes, pas seulement par le bouton : un bouton cache n'est
   pas une interdiction. */
async function remettreMotDePasse(id: string) {
  const refus = await debloquer(id, utilisateur, CODE_PAR_DEFAUT)
  setMessage(refus ?? `Mot de passe remis à ${CODE_PAR_DEFAUT}. La personne le change à la prochaine entrée.`)
  await lirePersonnes()
}

/* ---------- Autoriser, bloquer, supprimer ----------

   Le directeur voit trois etats : actif, en attente, bloque. Un
   compte en attente n'a jamais servi ; un compte bloque a servi et
   a ete ferme. Les deux se rouvrent avec le meme geste, mais seul
   le second a des essais rates a effacer — `autoriser()` s'en
   occupe dans les deux cas. */

async function autoriserPersonne(id: string) {
  const refus = await autoriser(id, utilisateur)
  setMessage(refus ?? 'Compte autorisé.')
  await lirePersonnes()
}

async function bloquerPersonne(id: string) {
  const refus = await bloquer(id, utilisateur)
  setMessage(refus ?? 'Compte bloqué.')
  await lirePersonnes()
}

async function supprimerPersonne(id: string) {
  const refus = await supprimer(id, utilisateur)
  setSuppression(null)
  setMessage(refus ?? 'Compte supprimé.')
  await lirePersonnes()
}

async function supprimerLesComptes() {
  const refus = await supprimerTousLesComptes(utilisateur)
  setConfirmerComptes(false)
  if (refus) {
    setMessage(refus)
    return
  }
  /* Le compte connecte vient de partir avec les autres. On ferme
     la session : l'ecran de connexion proposera de creer le
     premier compte, qui redeviendra directeur. */
  deconnecter()
}

async function effacerLeStock() {
  await effacerStock()
  setConfirmerStock(false)
  setMessage('Stock effacé. Les comptes, rayons, zones et emplacements restent.')
  await rafraichir()
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

        {/* ---------- Les comptes ----------

            Trois etats, trois gestes. Un compte en attente n'a
            jamais servi ; un compte bloque a servi et a ete ferme.
            Les deux se rouvrent avec « Autoriser », mais seul le
            second a des essais rates a effacer.

            « Code 00000 » ne rouvre pas un compte bloque : il
            remplace le mot de passe oublie. Il faut ensuite
            autoriser, sinon le blocage tient — et c'est voulu. */}
        <div className="carte" data-carte="comptes">
          <p className="section__titre">Les comptes</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            {peutGererRayons
              ? "Un compte en attente ne peut pas entrer. Autorise-le, bloque-le ou efface-le."
              : "Les personnes de ce téléphone."}
          </p>

          <ul className="codes" data-liste="comptes">
            {personnes.map((p) => {
              const etat = etatCompte(p)
              const soiMeme = p.id === utilisateur?.id
              return (
                <li
                  key={p.id}
                  className="codes__ligne"
                  data-compte={p.id}
                  data-etat={etat}
                  style={{
                    cursor: 'default',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span
                      className="codes__nom"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                    >
                      <span>{p.nom}{soiMeme ? ' (toi)' : ''}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--c-500)', fontWeight: 500 }}>
                        {NOM_ROLE[p.role]} · {p.mail ?? 'Pas de courriel'}
                      </span>
                    </span>
                    <span
                      className="codes__peut"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}
                    >
                      <span
                        data-etat-compte={etat}
                        style={{
                          fontWeight: 700,
                          color: etat === 'actif'
                            ? 'var(--teal-700)'
                            : etat === 'en_attente'
                              ? 'var(--wrn-700)'
                              : 'var(--dgr-700)',
                        }}
                      >
                        {NOM_ETAT[etat]}
                      </span>
                      {p.telephone ? (
                        <span className="num">{p.telephone}</span>
                      ) : (
                        <span style={{ color: 'var(--wrn-700)' }}>Pas de numéro</span>
                      )}
                    </span>
                  </div>

                  {peutGererRayons && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {etat !== 'actif' && (
                        <Bouton variante="secondaire" surClick={() => void autoriserPersonne(p.id)}>
                          Autoriser
                        </Bouton>
                      )}
                      {etat === 'actif' && !soiMeme && (
                        <Bouton variante="secondaire" surClick={() => void bloquerPersonne(p.id)}>
                          Bloquer
                        </Bouton>
                      )}
                      <Bouton variante="secondaire" surClick={() => void remettreMotDePasse(p.id)}>
                        Code {CODE_PAR_DEFAUT}
                      </Bouton>
                      {!soiMeme && (
                        suppression === p.id ? (
                          <>
                            <Bouton variante="danger" surClick={() => void supprimerPersonne(p.id)}>
                              Confirmer
                            </Bouton>
                            <Bouton variante="secondaire" surClick={() => setSuppression(null)}>
                              Annuler
                            </Bouton>
                          </>
                        ) : (
                          <Bouton
                            variante="danger"
                            icone="croix"
                            surClick={() => setSuppression(p.id)}
                          >
                            Supprimer
                          </Bouton>
                        )
                      )}
                    </div>
                  )}

                  {suppression === p.id && (
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dgr-700)' }}>
                      Effacer {p.nom} ? Ses mouvements restent.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          {peutGererRayons && (
            <div style={{ marginTop: 16 }}>
              {confirmerComptes ? (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--dgr-700)' }}>
                    Effacer tous les comptes ? Le stock reste.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Bouton variante="danger" icone="croix" surClick={() => void supprimerLesComptes()}>
                      Confirmer
                    </Bouton>
                    <Bouton variante="secondaire" surClick={() => setConfirmerComptes(false)}>
                      Annuler
                    </Bouton>
                  </div>
                </>
              ) : (
                <Bouton variante="danger" icone="croix" surClick={() => setConfirmerComptes(true)}>
                  Effacer les comptes
                </Bouton>
              )}
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--c-500)' }}>
                {CODE_PAR_DEFAUT} est un mot de passe provisoire : la personne le change
                dès qu'elle entre.
              </p>
            </div>
          )}
        </div>

        {/* ---------- Qui gere quel rayon ---------- */}
        {peutGererRayons && (
          <div className="carte">
            <p className="section__titre">Transférer</p>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
              Une personne n'ouvre que son rayon.
            </p>
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

        {/* ---------- Effacer le stock ----------

            Le stock part, les personnes restent. Deux gestes
            separes : effacer les comptes ne doit pas emporter les
            produits, et effacer le stock ne doit pas fermer la
            porte au directeur. */}
        <div className="carte" data-carte="stock">
          <p className="section__titre">Effacer le stock</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--c-700)' }}>
            Produits, lots, mouvements, alertes. Les comptes, rayons, zones et
            emplacements restent.
          </p>
          {confirmerStock ? (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--dgr-700)' }}>
                Effacer le stock ? Cette action est définitive.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Bouton variante="danger" icone="croix" surClick={() => void effacerLeStock()}>
                  Confirmer
                </Bouton>
                <Bouton variante="secondaire" surClick={() => setConfirmerStock(false)}>
                  Annuler
                </Bouton>
              </div>
            </>
          ) : (
            <Bouton variante="danger" icone="croix" surClick={() => setConfirmerStock(true)}>
              Effacer le stock
            </Bouton>
          )}
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
