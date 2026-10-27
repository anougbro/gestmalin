import { base } from '../donnees/base'
import {
  aLeDroit,
  DUREE_BLOCAGE_MS,
  empreinte,
  ESSAIS_MAX,
  estBloque,
  LONGUEUR_CODE,
  mailLibre,
  normaliserTelephone,
  numeroLibre,
  type Utilisateur,
} from '../domaine/acces'

/* ============================================================
   DEPLACER UNE PERSONNE D'UN RAYON A L'AUTRE

   Une seule fonction, une seule table. Les reglages s'en servent,
   et rien d'autre ne modifie `rayonsAutorises` a la main : une
   ecriture faite a deux endroits finit par diverger, et c'est
   toujours la version sans controle qui survit.

   Le refus qui compte est le second. Se retirer son propre rayon
   depuis les reglages, sur un telephone sans serveur, revient a
   se verrouiller dehors : plus de produit dans son rayon, plus
   d'acces, et personne pour rouvrir la base. Le coup est
   irreversible.

   Se déplacer vers un rayon qu'on ne gère pas soi-même est refusé
   pour la meme raison, par un autre chemin. */
export async function deplacerVersRayon(
  id: string,
  rayonId: string,
  auteur: Utilisateur | null,
): Promise<string | null> {
  if (!auteur || !aLeDroit(auteur.role, 'utilisateurs')) {
    return "Tu n'as pas le droit de déplacer quelqu'un."
  }

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  if (auteur.id === id) {
    /* Se garder soi-meme est permis — un directeur peut
       volontairement se limiter a un seul rayon. Se retirer,
       non : c'est sans retour. */
    if (!u.rayonsAutorises.includes(rayonId)) {
      return "Tu ne peux pas te retirer ton propre rayon."
    }
  } else if (!auteur.rayonsAutorises.includes(rayonId)) {
    return "Tu ne peux pas attribuer un rayon que tu ne gères pas."
  }

  await base.utilisateurs.put({ ...u, rayonsAutorises: [rayonId] })
  return null
}

/* ============================================================
   CHANGER SON NUMERO

   Un numero partage est un acces qui ouvre la mauvaise personne :
   le code de l'une ouvre le compte de l'autre, et le cloisonnement
   des rayons ne vaut plus rien.

   L'unicite est verifiee ici, au moment d'ecrire, et pas a la
   saisie : entre le moment ou la personne frappe son numero et le
   moment ou elle valide, dix secondes passent et une autre saisie
   peut avoir change la donnee. C'est l'ecriture qui doit faire
   foi.

   Les comptes sans numero ne reservent rien : ils se connectent
   par leur nom, et ils ne peuvent pas interdire un numero a
   quelqu'un d'autre. */
export async function changerNumero(
  id: string,
  numero: string,
): Promise<{ ok: true } | { ok: false; raison: string }> {
  const tous = await base.utilisateurs.toArray()
  if (!numeroLibre(tous, numero, id)) return { ok: false, raison: 'Ce numéro est déjà pris.' }

  const u = await base.utilisateurs.get(id)
  if (!u) return { ok: false, raison: 'Personne introuvable.' }

  await base.utilisateurs.put({ ...u, telephone: normaliserTelephone(numero), independant: true })
  return { ok: true }
}

/* ============================================================
   LES ESSAIS RATES ET LE DEBLOCAGE

   Le compteur vit dans la base, pas dans l'ecran : sinon un
   rafraichissement remettrait le compteur a zero, et le blocage
   ne bloquerait rien.

   On ne compte que les mauvais mots de passe. Un compte
   desactive, un numero partage ou un compte deja bloque ne sont
   pas des essais : les compter punirait quelqu'un qui n'a rien
   tape. */

export async function noterEssaiRate(
  id: string,
): Promise<{ bloque: boolean; restants: number }> {
  const u = await base.utilisateurs.get(id)
  if (!u) return { bloque: false, restants: ESSAIS_MAX }

  const tentatives = (u.tentatives ?? 0) + 1

  if (tentatives >= ESSAIS_MAX) {
    await base.utilisateurs.update(id, {
      tentatives,
      bloqueJusqua: Date.now() + DUREE_BLOCAGE_MS,
    })
    return { bloque: true, restants: 0 }
  }

  await base.utilisateurs.update(id, { tentatives })
  return { bloque: false, restants: ESSAIS_MAX - tentatives }
}

/** Une entree reussie efface les essais rates. */
export async function oublierEssais(id: string): Promise<void> {
  await base.utilisateurs.update(id, { tentatives: 0, bloqueJusqua: 0 })
}

/**
 * Lever le blocage d'une personne, et lui rendre un mot de passe
 * provisoire.
 *
 * Reserve au directeur : c'est le seul role qui a le droit
 * `utilisateurs`. On ne verifie pas seulement le role a l'ecran —
 * la fonction le verifie elle-meme, parce qu'un bouton cache n'est
 * pas une interdiction.
 */
export async function debloquer(
  id: string,
  auteur: Utilisateur | null,
  motDePasseProvisoire?: string,
): Promise<string | null> {
  if (!auteur || !aLeDroit(auteur.role, 'utilisateurs')) {
    return "Tu n'as pas le droit de débloquer quelqu'un."
  }

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  if (motDePasseProvisoire !== undefined) {
    if (motDePasseProvisoire.length !== LONGUEUR_CODE) {
      return `Le mot de passe doit faire ${LONGUEUR_CODE} chiffres.`
    }
    await base.utilisateurs.put({
      ...u,
      tentatives: 0,
      bloqueJusqua: 0,
      longueurCode: LONGUEUR_CODE,
      empreinte: empreinte(u.id, motDePasseProvisoire),
    })
    return null
  }

  await base.utilisateurs.update(id, { tentatives: 0, bloqueJusqua: 0 })
  return null
}

/* ============================================================
   AUTORISER, BLOQUER, SUPPRIMER

   Trois gestes de directeur, et trois refus qui comptent :

   1. Personne ne se ferme sa propre porte. Ni blocage, ni
      suppression de son propre compte : sur un telephone sans
      serveur, il n'y a personne pour rouvrir.

   2. Il doit rester un directeur actif. Sans cela, plus personne
      ne peut autoriser, bloquer ou remettre un code — et il faut
      effacer la base pour en sortir.

   3. Un compte en attente n'est pas un compte bloque. Autoriser
      ne fait pas que lever un drapeau : cela efface aussi les
      essais rates, pour que la personne commence proprement.
   ============================================================ */

function refusGestion(auteur: Utilisateur | null): string | null {
  if (!auteur || !aLeDroit(auteur.role, 'utilisateurs')) {
    return "Tu n'as pas le droit de gérer les comptes."
  }
  return null
}

/** Reste-t-il un directeur capable d'agir si on retire celui-la ? */
async function resteUnDirecteur(idRetire: string): Promise<boolean> {
  const tous = await base.utilisateurs.toArray()
  return tous.some(
    (u) => u.id !== idRetire && u.role === 'directeur' && u.actif && !estBloque(u),
  )
}

/** Ouvre un compte en attente, ou rouvre un compte bloque. */
export async function autoriser(
  id: string,
  auteur: Utilisateur | null,
): Promise<string | null> {
  const refus = refusGestion(auteur)
  if (refus) return refus

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  await base.utilisateurs.put({
    ...u,
    actif: true,
    enAttente: false,
    tentatives: 0,
    bloqueJusqua: 0,
  })
  return null
}

/** Ferme un compte pour de bon, sans duree. */
export async function bloquer(
  id: string,
  auteur: Utilisateur | null,
): Promise<string | null> {
  const refus = refusGestion(auteur)
  if (refus) return refus
  if (auteur && auteur.id === id) return 'Tu ne peux pas bloquer ton propre compte.'

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  if (u.role === 'directeur' && !(await resteUnDirecteur(id))) {
    return 'Il doit rester un directeur actif.'
  }

  await base.utilisateurs.put({
    ...u,
    actif: false,
    enAttente: false,
    tentatives: 0,
    bloqueJusqua: 0,
  })
  return null
}

/** Efface un compte. Ses mouvements restent : le stock ne s'efface pas. */
export async function supprimer(
  id: string,
  auteur: Utilisateur | null,
): Promise<string | null> {
  const refus = refusGestion(auteur)
  if (refus) return refus
  if (auteur && auteur.id === id) return 'Tu ne peux pas supprimer ton propre compte.'

  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  if (u.role === 'directeur' && !(await resteUnDirecteur(id))) {
    return 'Il doit rester un directeur actif.'
  }

  await base.utilisateurs.delete(id)
  return null
}

/**
 * Efface TOUS les comptes. Le stock reste.
 *
 * C'est le geste de remise a zero des personnes : on repart de la
 * premiere personne qui se presente, et elle devient directrice.
 * L'appelant doit fermer la session : le compte connecte vient
 * forcement de partir avec les autres.
 */
export async function supprimerTousLesComptes(
  auteur: Utilisateur | null,
): Promise<string | null> {
  const refus = refusGestion(auteur)
  if (refus) return refus

  await base.utilisateurs.clear()
  return null
}

/* ============================================================
   CHANGER SON COURRIEL

   Facultatif : une chaine vide l'efface. Mais quand il est
   present, il est UNIQUE, pour la meme raison que le numero :
   deux comptes sur la meme adresse, et le responsable ne sait
   plus qui joindre quand l'un des deux oublie son mot de passe.

   L'unicite se verifie ici, a l'ecriture. Un controle fait a la
   saisie ne vaut rien : entre la frappe et la validation, une
   autre personne peut avoir pris l'adresse.
   ============================================================ */
export async function changerMail(id: string, mail: string): Promise<string | null> {
  const u = await base.utilisateurs.get(id)
  if (!u) return 'Personne introuvable.'

  const propre = mail.trim()

  /* Vide veut dire efface, pas chaine vide : un champ vide ne doit
     pas s'afficher comme une adresse dans la liste des personnes. */
  if (!propre) {
    const sansMail = { ...u }
    delete sansMail.mail
    await base.utilisateurs.put(sansMail)
    return null
  }

  const tous = await base.utilisateurs.toArray()
  if (!mailLibre(tous, propre, id)) return 'Ce courriel est déjà pris.'

  await base.utilisateurs.put({ ...u, mail: propre })
  return null
}
