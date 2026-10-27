import { base } from '../donnees/base'
import {
  aLeDroit,
  DUREE_BLOCAGE_MS,
  empreinte,
  ESSAIS_MAX,
  LONGUEUR_CODE,
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

/** Changer son propre mail. Facultatif : une chaine vide l'efface. */
export async function changerMail(id: string, mail: string): Promise<void> {
  const u = await base.utilisateurs.get(id)
  if (!u) return
  const propre = mail.trim()
  if (propre) {
    await base.utilisateurs.put({ ...u, mail: propre })
    return
  }
  const sansMail = { ...u }
  delete sansMail.mail
  await base.utilisateurs.put(sansMail)
}