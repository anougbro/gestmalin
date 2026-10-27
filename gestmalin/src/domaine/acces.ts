/* ============================================================
   L'ACCES — qui fait quoi

   Trois decisions structurantes :

   1. AUCUN mot de passe. Un code a 4 chiffres, tape d'une seule
      main, souvent avec des gants. Personne ne retient un mot
      de passe, et personne ne le tape sans le lire au mur.

   2. Le code n'est JAMAIS stocke en clair. On compare les
      empreintes. Si quelqu'un ouvre le fichier de la base, il
      ne trouve que des nombres sans signification.

   3. La liste des autorises est SIGNEE par le serveur. La
      signature est verifiee sur le telephone, SANS reseau. On
      ne peut donc pas s'ajouter un role en deconnecte — mais on
      n'a pas besoin du reseau pour ouvrir l'application.
   ============================================================ */

export type Role = 'preparateur' | 'responsable' | 'pharmacien' | 'directeur'

/* ============================================================
   LA LONGUEUR DU CODE

   Cinq chiffres, pas quatre. 10 000 combinaisons a quatre, cent
   mille a cinq : dix fois plus.

   UNE constante, ici, et nulle part ailleurs. La longueur
   apparait dans l'ecran de connexion, celui des reglages, les
   empreintes, les migrations et les tests. Ecrit en dur dans
   chacun de ces endroits, c'est un nombre qui finit par
   differer d'un ecran a l'autre : le changement en accepte cinq,
   la connexion en attend quatre, et personne ne sait pourquoi
   le code marche parfois.
   ============================================================ */
export const LONGUEUR_CODE = 5

/* ============================================================
   LE NUMERO DE TELEPHONE

   Il remplace le choix du nom a la connexion. On tape son numero,
   on tape son code, on entre : deux tapes, sans liste a faire
   defiler.

   DIX CHIFFRES, sans l'indicatif pays. L'indicatif est le meme
   pour tout le monde au Niger : le demander ne sert a rien et
   allonge la frappe de trois caracteres.

   Le numero EST l'identite de la personne. Deux consequences
   qu'on ne peut pas contourner :

   1. Il doit etre UNIQUE. Deux personnes ne peuvent pas porter le
      meme numero : sinon le code de l'une ouvre le compte de
      l'autre, et le cloisonnement des rayons ne vaut plus rien.

   2. On ne devine pas un numero. Un numero faux, c'est un numero
      inconnu — jamais un code faux, qui ferait croire a une
      erreur de frappe alors qu'on s est trompe de numero. */
export const LONGUEUR_TELEPHONE = 10

/**
 * Ne garde que les chiffres, et complete a gauche si besoin.
 *
 * « +227 90 12 34 56 » et « 9012345678 » doivent etre LE MEME
 * compte. Sinon la meme personne se cree deux comptes en changeant
 * la maniere d'ecrire son numero, et elle perd l'acces a son
 * propre stock sans comprendre pourquoi.
 */
export function normaliserTelephone(texte: string): string {
  const chiffres = texte.replace(/\D/g, '')
  return chiffres.length > LONGUEUR_TELEPHONE
    ? chiffres.slice(-LONGUEUR_TELEPHONE)
    : chiffres.padStart(LONGUEUR_TELEPHONE, '0')
}

/** Vrai si le texte peut devenir un numero complet. */
export function telephoneSaisi(texte: string): boolean {
  return texte.replace(/\D/g, '').length === LONGUEUR_TELEPHONE
}

/** Un numero libre, ou null s'il est deja pris. */
export function numeroLibre(
  utilisateurs: readonly Utilisateur[],
  telephone: string,
  saufId?: string,
): boolean {
  const voulu = normaliserTelephone(telephone)
  return !utilisateurs.some((u) => u.id !== saufId && u.telephone && normaliserTelephone(u.telephone) === voulu)
}

export type Utilisateur = {
  id: string
  nom: string
  role: Role
  rayonsAutorises: string[]
  actif: boolean
  empreinte: string

  /**
   * Le numero de telephone : dix chiffres, sans indicatif.
   *
   * Vide pour les comptes anterieurs a cette regle, qui se
   * connectent encore par leur nom. Un compte sans numero n'est
   * pas un compte sans identite : la liste des noms reste la
   * porte de secours, justement pour eux.
   *
   * `independant` parce qu'un numero non unique ne trouve pas
   * UN compte, et en trouve potentiellement plusieurs. La regle
   * d'unicite est appliquee a l'ecriture ; la base doit pouvoir
   * contenir le cas impossible sans que la lecture echoue.
   */
  telephone?: string
  /** Deux comptes portent-ils le meme numero ? Ne doit jamais
      arriver ; si c'est vrai, on ne fait confiance a aucun des
      deux tant que la situation n'est pas corrigee. */
  independant: boolean
  /** Longueur du code AU MOMENT ou l'empreinte a ete calculee.

      Indispensable. Changer la longueur sans ce nombre revient a
      changer le schema des empreintes sans dire quoi faire des
      anciennes : le code de chacun devient introuvable, et plus
      personne ne peut entrer. C'est precisement ce qui est
      arrive au passage de 4 a 5 chiffres. */
  longueurCode: number
  /** Le courriel de la personne, s'il en a donne un.

      Facultatif et purement indicatif : l'application n'envoie
      rien, elle n'a pas de serveur. Il sert a reconnaitre la
      personne quand elle demande un nouveau mot de passe, et a la
      joindre hors de la pharmacie.

      UNIQUE quand il est present : deux comptes sur la meme
      adresse, et le responsable ne sait plus qui joindre quand
      l'un des deux oublie son mot de passe. L'unicite est
      verifiee a l'ecriture, comme pour le numero. */
  mail?: string
  /** Essais de mot de passe rates depuis la derniere reussite. */
  tentatives?: number
  /** Fin du blocage, en millisecondes epoch. 0 ou absent : libre. */
  bloqueJusqua?: number
  /** Deleguations accordees a cet utilisateur, avec leur fin. */
  mandats?: Mandat[]
}

export type Mandat = {
  id: string
  delegataireId: string
  deleguanteId: string
  rayonId: string
  debut: string
  fin: string
  motif?: string
}

/* ---------- Les droits par role ---------- */

export type Droit = 'mouvements' | 'inventaire' | 'valider' | 'referentiels' | 'utilisateurs'

const DROITS: Record<Role, readonly Droit[]> = {
  preparateur: ['mouvements', 'inventaire'],
  responsable: ['mouvements', 'inventaire', 'valider'],
  pharmacien: ['mouvements', 'inventaire', 'valider', 'referentiels'],
  directeur: ['mouvements', 'inventaire', 'valider', 'referentiels', 'utilisateurs'],
}

export function aLeDroit(role: Role, droit: Droit): boolean {
  return DROITS[role].includes(droit)
}

/* ---------- L'empreinte du code ----------

   Ce n'est pas un hachage cryptographique — on ne peut pas s'en
   servir pour un mot de passe bancaire. C'est une empreinte
   rapide et sans dependance, suffisante pour empecher de lire
   les codes en ouvrant la base.

   Le but est precis : qu'un regard sur le fichier de la base ne
   donne pas 3409 a la personne qui lit. */

export function empreinte(identifiant: string, code: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const graine = `${identifiant}:${code}`
  for (let i = 0; i < graine.length; i++) {
    const c = graine.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0
  }
  const sel = 'gestmalin'
  let h3 = 0
  for (let i = 0; i < sel.length; i++) h3 = (Math.imul(h3, 31) + sel.charCodeAt(i)) >>> 0
  return [h1, h2, h3].map((n) => n.toString(36)).join('-')
}

export function codeCorrect(identifiant: string, codeSaisi: string, empreinteStockee: string): boolean {
  return empreinte(identifiant, codeSaisi) === empreinteStockee
}

/* ---------- L'autorite effective ----------

   On ne se fie JAMAIS au role seul. Le role dit ce que la
   personne fait d'habitude ; le mandat dit ce qu'elle peut faire
   aujourd'hui, parce qu'on lui a confie.

   Un mandat vaut SEULEMENT dans sa fenetre et SEULEMENT sur son
   rayon. Il ne se renouvelle pas tout seul : un delegation
   temporaire qui devient permanente par oubli, c'est une
   delegation qui n'en est plus une. */

export function aLeMandat(u: Utilisateur, rayonId: string, maintenant: string): boolean {
  return (u.mandats ?? []).some(
    (m) => m.rayonId === rayonId && m.debut <= maintenant && maintenant <= finDeMandat(m.fin),
  )
}

/**
 * Une delegation « jusqu'au 15 » veut dire TOUTE LA JOURNEE du 15.
 *
 * Comparer des dates ISO comme du texte ne marche que si les deux
 * ont la meme precision : '2026-06-15T12:00:00Z' est plus grand que
 * '2026-06-15', donc un mandat expirerait a MINUIT le 15, et le
 * pharmacien perdrait ses droits en pleinematin.
 */
export function finDeMandat(fin: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(fin) ? `${fin}T23:59:59Z` : fin
}

export function peutValider(u: Utilisateur, rayonId: string, maintenant: string): boolean {
  const parRole = aLeDroit(u.role, 'valider') && u.rayonsAutorises.includes(rayonId)
  return parRole || aLeMandat(u, rayonId, maintenant)
}

export function peutUtiliser(u: Utilisateur, rayonId: string): boolean {
  return u.actif && u.rayonsAutorises.includes(rayonId)
}

/* ---------- Les rayons d'une personne, vus de l'exterieur ----------

   Le modèle ne connait que des identifiants de rayon ; l'ecran ne
   connait que des noms et des couleurs. Cette fonction est le seul
   endroit ou les deux se rencontrent.

   Elle rend la LISTE des rayons utilisables, dans le bon ordre.
   Deux raisons de ne pas la demander a l'interface :

   1. Un rayon non autorise ne doit pas seulement etre refuse au
      moment du clic — il ne doit pas etre AFFICHE. Une pastille
      grise qu'on ne peut pas toucher apprend au contraire qu'il
      existe un Menagers, ce qui n'a aucun interet pour la
      personne qui ne le gere pas.

   2. Sans connexion, c'est-a-dire avant toute identification, la
      liste est celle de tout le monde. C'est ce qui permet
      d'ouvrir l'application avant de taper son code, et de voir
      ou l'on se trouve. */
export function rayonsUtilisables(u: Utilisateur | null, tous: Array<{ id: string }>): string[] {
  if (!u) return tous.map((r) => r.id)
  /* On passe par `peutUtiliser` et non par une lecture directe
     de `rayonsAutorises`. Les deux repondent a la meme question,
     ils doivent donc venir du meme endroit : sinon il suffit
     qu'un jour la premiere ajoute une condition — « actif »,
     par exemple — pour que la liste montre un rayon que l'acces
     refuse. Une pastille grise qui ne marche pas. */
  return tous.filter((r) => peutUtiliser(u, r.id)).map((r) => r.id)
}

/** Le role effectif, pour l'affichage : le mandat remonte en tete. */
export function roleEffectif(u: Utilisateur, rayonId: string, maintenant: string): string {
  if (aLeMandat(u, rayonId, maintenant)) return 'Mandat du pharmacien'
  return u.role
}

/* ---------- Le blocage apres trop d'essais ----------

   Cinq essais, puis quinze minutes. Deux nombres choisis pour la
   vraie vie d'une pharmacie : cinq, parce qu'une personne qui se
   trompe deux fois se trompe rarement cinq ; quinze minutes,
   parce qu'un blocage definitif sur un telephone partage mettrait
   l'officine par terre, et qu'il n'y a pas de serveur pour
   debloquer a distance.

   Le directeur peut lever le blocage tout de suite depuis les
   reglages. Le delai n'est la que pour le cas ou c'est lui qui
   est bloque : sans cela, personne ne pourrait plus entrer, et il
   faudrait effacer la base — donc perdre le stock. */
export const ESSAIS_MAX = 5
export const DUREE_BLOCAGE_MS = 15 * 60 * 1000

export function estBloque(u: Utilisateur, maintenant = Date.now()): boolean {
  return typeof u.bloqueJusqua === 'number' && u.bloqueJusqua > maintenant
}

/** Un mail plausible. Volontairement large : on ne veut pas
    refuser l'adresse rare d'un fournisseur, seulement la faute
    evidente — un espace, pas d'arobase, pas de point. */
export function mailValide(mail: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.trim())
}

/**
 * Un courriel libre, ou false s'il est deja pris.
 *
 * Les adresses ne sont pas sensibles a la casse : `Amina@Exemple.com`
 * et `amina@exemple.com` designent la meme boite. Les comparer
 * telles quelles laisserait passer deux comptes pour une seule
 * adresse — et le responsable ne saurait plus qui joindre.
 *
 * Un compte sans courriel ne reserve rien : il ne doit pas empecher
 * quelqu'un d'autre de donner le sien.
 */
export function mailLibre(
  utilisateurs: readonly Utilisateur[],
  mail: string,
  saufId?: string,
): boolean {
  const voulu = mail.trim().toLowerCase()
  return !utilisateurs.some(
    (u) => u.id !== saufId && u.mail && u.mail.trim().toLowerCase() === voulu,
  )
}

/* ---------- La connection, sans reseau ---------- */

export type ResultatConnexion =
  | { ok: true; utilisateur: Utilisateur }
  | { ok: false; raison: 'code-incorrect' | 'inactif' | 'numero-inconnu' | 'numero-partage' | 'bloque' }

const ECHEC_CODE = { ok: false as const, raison: 'code-incorrect' as const }

/**
 * Le code identifie UNE PERSONNE, pas une personne sur un rayon.
 *
 * C'est la distinction qui compte entre s'identifier et avoir le
 * droit. Si la connexion verifiait le rayon, une personne qui ne
 * travaille que sur les Menagers ne pourrait jamais entrer, parce
 * que l'application s'ouvre sur le rayon precedent. Elle serait
 * bloquee par un detail d'ecran, sans aucun moyen de s'en sortir.
 *
 * Donc : le numero et le code disent QUI VOUS ETES. Ce que vous
 * pouvez faire sur chaque rayon se verifie ensuite, a chaque ecran
 * (peutUtiliser, peutValider).
 */
export function connecter(
  utilisateurs: readonly Utilisateur[],
  identifiant: string,
  code: string,
): ResultatConnexion {
  const u = utilisateurs.find((x) => x.id === identifiant)
  return verifier(u, code)
}

/** La porte principale : son numero, puis son code. */
export function connecterParNumero(
  utilisateurs: readonly Utilisateur[],
  telephone: string,
  code: string,
): ResultatConnexion {
  const voulu = normaliserTelephone(telephone)
  const trouves = utilisateurs.filter((u) => u.telephone && normaliserTelephone(u.telephone) === voulu)

  if (trouves.length === 0) return { ok: false, raison: 'numero-inconnu' }
  if (trouves.length > 1) return { ok: false, raison: 'numero-partage' }

  return verifier(trouves[0], code)
}

/**
 * La regle unique, appliquee par les deux portes.
 *
 * Les deux chemins — par le numero, par le nom — finissent ici.
 * Deux fonctions qui verifient chacune de leur cote finissent
 * toujours par diverger sur un cas forget : une porte ouverte la
 * ou l'autre ne se voit pas.
 */
function verifier(u: Utilisateur | undefined, code: string): ResultatConnexion {
  /* Meme message dans tous les cas d'echec : sinon on permet de
     deviner quels identifiants existent. */
  if (!u) return ECHEC_CODE

  /* Un compte bloque ne compare meme pas le code : laisser
     tourner la comparaison reviendrait a offrir des essais
     gratuits pendant le blocage. */
  if (estBloque(u)) return { ok: false, raison: 'bloque' }

  /* Un compte enregistre avec un autre nombre de chiffres n'est
     pas utilisable : son empreinte ne correspond a rien de
     saisissable aujourd'hui. Il faut qu'il soit repare d'abord —
     c'est le travail de `reparerComptes`, pas de la connexion.

     Sans cette garde, une base a moitie migree accepterait encore
     un ancien code a quatre chiffres. La migration aurait l'air
     d'avoir marche tout en laissant une porte ouverte. */
  if (u.longueurCode !== LONGUEUR_CODE) return ECHEC_CODE

  /* Idem pour la longueur saisie : un code de trois chiffres ne
     peut pas etre le bon. On ne le demande pas, mais on ne le
     laisse pas passer non plus. */
  if (code.length !== LONGUEUR_CODE) return ECHEC_CODE

  if (!codeCorrect(u.id, code, u.empreinte)) return ECHEC_CODE
  if (!u.actif) return { ok: false, raison: 'inactif' }

  /* Un numero partage par deux comptes : ni l'un ni l'autre n'est
     fiable. On refuse, meme avec le BON code. C'est la seule
     facon de ne pas laisser un code ouvrir le mauvais rayon. */
  if (u.independant === false) return { ok: false, raison: 'numero-partage' }

  return { ok: true, utilisateur: u }
}