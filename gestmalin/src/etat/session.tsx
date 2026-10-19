import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { base } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { calculerAlertes, compterAlertes, type Alerte } from '../domaine/alertes'
import { aujourdhui } from '../domaine/temps'
import { maintenantISO } from '../domaine/temps'
import { connecter as verifierCode, peutUtiliser, rayonsUtilisables, type Utilisateur } from '../domaine/acces'
import type { Mouvement } from '../domaine/types'
import { Contexte, type Session } from './useSession'
import { RAYONS_PAR_DEFAUT, type RayonTravail } from './rayons'
import { dejaPreparee, demarrer, reparerComptes } from './preparation'

/* ============================================================
   L'ETAT DE L'APPLICATION

   UN SEUR endroit qui sait quel rayon on regarde, QUI ON EST, et
   ce qui se passe a l'ecran.

   Les ecrans ne parlent JAMAIS directement a la base :
   ils passent par ici. C'est ce qui evite d'avoir deux endroits
   qui donnent deux versions differentes de la meme reponse.
   ============================================================ */

/* ---------- La session, entre deux ouvertures ----------

   Rafraichir la page ne doit PAS deconnecter : sur telephone,
   une actualisation arrive quand on est presse, et redemander
   le code au milieu d'une rupture de stock est une gene.

   Mais on ne veut pas non plus qu'un appareil shared reste
   connecte overnight. D'ou `sessionStorage` : la session
   survit a un rafraichissement et disparait a la fermeture de
   l'onglet. Ni le code, ni la personne : seulement l'identifiant,
   et il est reverifie dans la base au demarrage. */

const CLE_SESSION = 'gestmalin.session'

function lireSession(): string | null {
  try {
    return sessionStorage.getItem(CLE_SESSION)
  } catch {
    /* Mode prive de certains navigateurs : pas de session
       conservee, on redemandera le code. Mieux vaut ca que
       planter au demarrage. */
    return null
  }
}

function ecrireSession(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(CLE_SESSION)
    else sessionStorage.setItem(CLE_SESSION, id)
  } catch {
    /* Sans consequence : la personne reste connectee jusqu'a
       la fermeture, ce qui est le comportement normal. */
  }
}
/** Dexie cache ses vraies erreurs dans un BulkError : sans
    ouvrir le boite, on ne sait pas QUELLE ecriture a echoue. */
function detailErreur(e: unknown): unknown {
  if (e && typeof e === 'object' && 'failures' in e) {
    const echecs = (e as { failures?: unknown[] }).failures ?? []
    return {
      message: String((e as { message?: unknown }).message ?? ''),
      echecs: echecs.map((x) => ({
        nom: (x as { name?: string }).name,
        message: (x as Error)?.message,
        cle: (x as { inner?: unknown[] })?.inner?.[0],
      })),
    }
  }
  return e
}

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [rayon, setRayon] = useState<RayonTravail>(RAYONS_PAR_DEFAUT[0])
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [enAttente, setEnAttente] = useState(0)
  const [pret, setPret] = useState(false)

  /* Charger une base IndexedDB EST une synchronisation avec un
     systeme externe. Le setState arrive dans la promesse, donc
     apres le rendu : il n'y a pas de cascade. */
  async function rafraichir() {
    const [produits, lots, mouvements, emplacements, zones] = await Promise.all([
      base.produits.where('rayonId').equals(rayon.id).toArray(),
      base.lots.toArray(),
      base.mouvements.where('rayonId').equals(rayon.id).toArray() as Promise<Mouvement[]>,
      base.emplacements.toArray(),
      base.zones.toArray(),
    ])

    const zonesQuarantaine = zones
      .filter((z) => z.rayonId === rayon.id && z.type === 'quarantaine')
      .map((z) => z.id)

    setAlertes(
      calculerAlertes({
        produits,
        lots: lots.filter((l) => produits.some((p) => p.id === l.produitId)),
        mouvements,
        emplacementsQuarantaine: emplacements
          .filter((e) => zonesQuarantaine.includes(e.zoneId))
          .map((e) => e.id),
        reference: aujourdhui(),
      }),
    )

    setEnAttente(await base.demandesApprobation.where('statut').equals('en_attente').count())
  }

  /* Ramener sur un rayon qui appartient a la personne.

     Utilise a la connexion ET a la restauration de session : les
     deux endroits ont la meme regle, donc le meme code. Sans
     cela, on entre sur un ecran qui n est pas le sien, et on ne
     comprend pas pourquoi il est vide. */
  function rayonAutorise(u: Utilisateur, courant: RayonTravail): void {
    if (peutUtiliser(u, courant.id)) return
    const autre = RAYONS_PAR_DEFAUT.find((x) => peutUtiliser(u, x.id))
    if (autre) setRayon(autre)
  }

  /* La connexion est verifiee SUR PLACE, sans reseau : la base
     contient les empreintes, et le code saisi est compare a
     celle de la personne. */
  async function connecter(identifiant: string, code: string) {
    try {
      const tous = await base.utilisateurs.toArray()
      const r = verifierCode(tous, identifiant, code)
      if (r.ok) {
        setUtilisateur(r.utilisateur)
        ecrireSession(r.utilisateur.id)
        /* Si le rayon ouvert n'est pas le sien, on l'amene sur un
           rayon qui l'est. Sinon elle entre sur un écran qui n'est
           pas le sien, sans comprendre pourquoi c'est vide. */
        rayonAutorise(r.utilisateur, rayon)
      }
      return r.ok
        ? { ok: true }
        : { ok: false, message: r.raison === 'inactif' ? 'Ce compte est désactivé.' : 'Code incorrect.' }
    } catch (e) {
      console.error('Connexion impossible', detailErreur(e))
      return { ok: false, message: 'Connexion impossible.' }
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        if (!(await dejaPreparee())) await demarrer()
        await reparerComptes()

        /* On restaure la personne d'avant le rafraichissement.
           On ne la fait PAS confiance : on la relit dans la base,
           et on verifie qu'elle est toujours active et qu'elle a
           toujours le droit sur le rayon ouvert. Un compte
           desactive entre-temps ne ressuscite pas. */
        const memorise = lireSession()
        if (memorise) {
          const u = await base.utilisateurs.get(memorise)
          if (u?.actif) {
            setUtilisateur(u)
            rayonAutorise(u, rayon)
          } else {
            ecrireSession(null)
          }
        }
      } catch (e) {
        /* Un demarrage casse sans rien dire laisse la personne
           devant un pave de chiffres qui ne marche pas.
           Dexie range ses erreurs dans un BulkError : il faut
           regarder dedans, sinon on ne sait pas ce qui a echoue. */
        console.error('Demarrage impossible', detailErreur(e))
      }
      setPret(true)
    })()
  }, [])

  useEffect(() => {
    if (pret) void rafraichir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayon, pret, maintenantISO().slice(0, 10)])

  const rayonsVisibles = useMemo(
    () => rayonsUtilisables(utilisateur, RAYONS_PAR_DEFAUT),
    [utilisateur],
  )

  /* ---------- Le changement de rayon ----------

     C'est ICI, et nulle part ailleurs, qu'une personne ne peut pas
     aller dans un rayon qui n'est pas le sien.

     Le modele possede `rayonsAutorises` depuis le debut, la regle
     `peutUtiliser` aussi, et ses tests passent. Mais rien ne
     l'appelait : changer de rayon consistait a `setRayon`, sans
     question. Une pastille grise etait donc un simple bouton, et
     la personne qui gere les Menagers pouvait basculer sur les
     Medicaments et y ranger des produits qui n'etaient vus par
     personne d'autre.

     Le renvoi dit au tiroir pourquoi le geste n'a rien change :
     un refus muet donne l'impression d'un ecran casse. */
  function changer(id: string): boolean {
    if (!utilisateur) {
      setRayon(RAYONS_PAR_DEFAUT.find((r) => r.id === id) ?? RAYONS_PAR_DEFAUT[0])
      return true
    }
    if (!peutUtiliser(utilisateur, id)) return false
    setRayon(RAYONS_PAR_DEFAUT.find((r) => r.id === id) ?? RAYONS_PAR_DEFAUT[0])
    return true
  }

  const valeur = useMemo<Session>(
    () => ({
      rayon,
      changeRayon: changer,
      rayonsVisibles,
      utilisateur,
      connecter,
      deconnecter: () => {
        setUtilisateur(null)
        ecrireSession(null)
      },
      alertes,
      compteurs: compterAlertes(alertes),
      enAttenteValidation: enAttente,
      rafraichir,
      pret,
      toutEffacer,
      demarrer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rayon, alertes, pret, utilisateur, enAttente, rayonsVisibles],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}
