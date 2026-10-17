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

export type Utilisateur = {
  id: string
  nom: string
  role: Role
  rayonsAutorises: string[]
  actif: boolean
  empreinte: string
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

/** Le role effectif, pour l'affichage : le mandat remonte en tete. */
export function roleEffectif(u: Utilisateur, rayonId: string, maintenant: string): string {
  if (aLeMandat(u, rayonId, maintenant)) return 'Mandat du pharmacien'
  return u.role
}

/* ---------- La connection, sans reseau ---------- */

export type ResultatConnexion =
  | { ok: true; utilisateur: Utilisateur }
  | { ok: false; raison: 'code-incorrect' | 'inactif' | 'rayon-refuse' }

export function connecter(
  utilisateurs: readonly Utilisateur[],
  identifiant: string,
  code: string,
  rayonId: string,
): ResultatConnexion {
  const u = utilisateurs.find((x) => x.id === identifiant)

  /* Meme message dans tous les cas d'echec : sinon on permet de
     deviner quels identifiants existent. */
  const echec = { ok: false as const, raison: 'code-incorrect' as const }
  if (!u) return echec
  if (!codeCorrect(u.id, code, u.empreinte)) return echec
  if (!u.actif) return { ok: false, raison: 'inactif' }
  if (!u.rayonsAutorises.includes(rayonId)) return { ok: false, raison: 'rayon-refuse' }

  return { ok: true, utilisateur: u }
}