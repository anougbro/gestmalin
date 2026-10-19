import { base, ATTENTE_ID } from '../donnees/base'
import { toutEffacer } from '../donnees/depots'
import { RAYONS_PAR_DEFAUT, ZONES_PAR_DEFAUT, emplacementsDeZone } from './rayons'
import { empreinte, LONGUEUR_CODE, normaliserTelephone, type Utilisateur } from '../domaine/acces'

/* ============================================================
   LE PREMIER AMORCAGE

   A la toute premiere ouverture, la base est vide : on y met
   les deux rayons, leurs zones, leurs emplacements, le quai de
   reception, et la personne qui travaille ici.

   Ce n'est PAS une donnee de demonstration : c'est la structure
   physique de la pharmacie. Les produits, eux, viendront par
   import ou saisie — on n'invente pas de medicaments.
   ============================================================ */

/* Le code de la personne creee au premier lancement.
   12345 est volontaire : c'est le code le plus facile a retenir
   pour une premiere connexion, et il se change aussitot.
   Il n'est stocke qu'en empreinte. */
export const CODE_INITIAL = '12345'

export const UTILISATEUR_INITIAL: Omit<Utilisateur, 'empreinte'> = {
  id: 'u-1',
  nom: 'Préparateur',
  role: 'preparateur',
  rayonsAutorises: ['r-med', 'r-men'],
  /* Pas de numero : ce compte existe depuis avant que le numero
     soit l'identite. Il se connecte par son nom, ce qui est
     exactement le chemin de secours prevu pour lui. */
  independant: true,
  actif: true,
  longueurCode: LONGUEUR_CODE,
}

/* L'amorcage ne peut tourner qu'UNE fois, meme si on l'appelle
   deux fois en meme temps.

   Pourquoi : deux appels simultanes voient tous les deux une base
   vide, effacent, puis inserent — et le second echoue sur une cle
   deja presente. En developpement, React lance l'effet deux fois
   exprès pour revealing des bogues. Sur un telephone lent, la
   meme course arrive pour de vrai.

   On partage donc la meme promesse : le second appel attend le
   premier, il ne recommence rien. */
let amorcage: Promise<void> | null = null

export function demarrer(): Promise<void> {
  if (!amorcage) amorcage = amorger()
  return amorcage
}

/** Pour les tests : on oublie que l'amorcage a deja eu lieu. */
export function oublierAmorcage(): void {
  amorcage = null
}

/* Une SEULE transaction pour vider et remplir. Sans cela, une
   lecture concurrente pourrait tomber sur la base a moitie
   vide — deux rayons, aucune zone. */
async function amorger(): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    await toutEffacer()
    await base.rayons.bulkAdd(RAYONS_PAR_DEFAUT.map((r, i) => ({ ...r, ordre: i })))
    await base.zones.bulkAdd(ZONES_PAR_DEFAUT)
    await base.emplacements.bulkAdd(ZONES_PAR_DEFAUT.flatMap((z) => emplacementsDeZone(z.id)))

    /* Le quai de reception : une position reelle qui n'appartient
       a aucune zone. Tout ce qui arrive passe par la avant d'etre pose. */
    await base.emplacements.put({ id: ATTENTE_ID, zoneId: '', code: 'QUAI', ordre: 0 })

    await base.utilisateurs.put(nouveauCompteInitial())
  })
}

/** L'application a-t-elle deja ete preparee ? */
export async function dejaPreparee(): Promise<boolean> {
  return (await base.rayons.count()) > 0
}
/** Code de secours remis a une personne dont le code est perdu. */
export const CODE_PAR_DEFAUT = '00000'

/**
 * Repare les personnes dont le code est devenu introuvable.
 *
 * Deux cas, et le deuxieme est celui du passage de 4 a 5 chiffres :
 *
 * 1. Une base creee AVANT que l'empreinte existe. Le code
 *    d'origine est perdu : on remet celui du premier compte.
 *
 * 2. Une base creee AVANT que la longueur change. Son empreinte a
 *    ete calculee sur un autre nombre de chiffres ; elle ne
 *    correspond plus a rien de saisissable. On ne peut pas deviner
 *    un code qu'on n'a jamais eu : on remet celui du premier
 *    compte, et on le dit. C'est le meme arbitraire, applique au
 *    bon moment.
 *
 * Retrouver ce cas sans le champ `longueurCode` serait impossible :
 * une empreinte a 4 chiffres et une a 5 sont la meme chaine de
 * caracteres pour la base. D'ou ce champ, et cette comparaison.
 */
/**
 * Une empreinte bien formee : trois nombres en base 36, separes
 * par des tirets, comme produite par `empreinte()`.
 *
 * Verifier la FORME et pas seulement la presence : une empreinte
 * vide se repere, une empreinte abimee ou tronquee non. Or une
 * empreinte abimee, avec la bonne longueur declaree, passe a
 * travers du controle sur `longueurCode` et rend le compte
 * inutilisable — et personne ne peut plus entrer, sans qu'aucun
 * message ne dise pourquoi.
 */
function empreinteBienFormee(e: string | undefined): boolean {
  return typeof e === 'string' && /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(e)
}

export async function reparerComptes(): Promise<number> {
  const tous = await base.utilisateurs.toArray()

  /* Filet de securite : une base peut avoir perdu ses personnes.
     Sans personne, l'ecran de connexion montre un pave que
     personne ne peut valider. On en recree une. */
  if (tous.length === 0) {
    await base.utilisateurs.put(nouveauCompteInitial())
    return 1
  }

  const aReparer = tous.filter((u) => !empreinteBienFormee(u.empreinte) || u.longueurCode !== LONGUEUR_CODE)

  /* ---------- Les numeros ----------

     Une base anterieure n'a pas de numero : ces comptes se
     connectent encore par leur nom, et c'est voulu — la liste
     reste la porte de secours de precisement ceux-la.

     En revanche, il faut savoir si deux comptes portent le meme
     numero. Un numero partage est un acces qui ouvre la mauvaise
     personne : `independant` passe a faux, et la connexion refuse
     les DEUX, meme avec le bon code. Mieux vaut deux portes
     fermees qu'une porte qui ouvre le mauvais rayon. */
  const parNumero = new Map<string, number>()
  for (const u of tous) {
    if (!u.telephone) continue
    const cle = normaliserTelephone(u.telephone)
    parNumero.set(cle, (parNumero.get(cle) ?? 0) + 1)
  }
  for (const u of tous) {
    if (!u.telephone) continue
    const partage = (parNumero.get(normaliserTelephone(u.telephone)) ?? 0) > 1
    if (u.independant === partage) continue
    await base.utilisateurs.put({ ...u, independant: !partage })
  }

  for (const u of aReparer) {
    await base.utilisateurs.put({
      ...u,
      longueurCode: LONGUEUR_CODE,
      independant: u.independant ?? true,
      empreinte: empreinte(u.id, u.id === UTILISATEUR_INITIAL.id ? CODE_INITIAL : CODE_PAR_DEFAUT),
    })
  }
  return aReparer.length
}

/** Le compte du tout premier lancement. */
export function nouveauCompteInitial(): Utilisateur {
  return {
    ...UTILISATEUR_INITIAL,
    longueurCode: LONGUEUR_CODE,
    independant: true,
    empreinte: empreinte(UTILISATEUR_INITIAL.id, CODE_INITIAL),
  }
}