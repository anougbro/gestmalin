import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LE NUMERO ET LE COURRIEL SONT UNIQUES

   Deux personnes ne peuvent pas entrer avec le meme numero : le
   code de l'une ouvrirait le compte de l'autre. Le courriel suit
   la meme regle, pour une raison plus discrete : quand deux
   comptes portent la meme adresse, le responsable ne sait plus
   qui joindre quand l'un des deux oublie son mot de passe.

   L'unicite doit tenir A L'ECRITURE, pas seulement a l'affichage.
   Ces verifications passent donc par les vrais ecrans, puis
   relisent la base : un message d'erreur peut cacher une ligne
   ecrite quand meme.

   Le courriel n'est pas sensible a la casse : `Amina@Exemple.com`
   et `amina@exemple.com` sont la meme boite. On le verifie exprès.
   ============================================================ */

const navigateur = await chromium.launch()
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1200)

/* ---------- Lire la base, pas l'ecran ---------- */

type Vu = {
  nom: string
  telephone: string | null
  mail: string | null
}

async function comptes(): Promise<Vu[]> {
  return page.evaluate(async () => {
    const { base } = await import('/src/donnees/base.ts')
    return (await base.utilisateurs.toArray()).map((u) => ({
      nom: u.nom,
      telephone: u.telephone ?? null,
      mail: u.mail ?? null,
    }))
  }) as Promise<Vu[]>
}

async function taperPave(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(50)
  }
}

/** Ouvre la creation et repond aux quatre premieres questions. */
async function arriverAuCourriel(nom: string, numero: string, code: string, rayon: string) {
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await page.waitForTimeout(600)
  await page.locator('input.champ__saisie').first().fill(nom)
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: rayon }).click()
  await page.waitForTimeout(400)
  for (const saisie of [numero, code, code]) {
    await taperPave(saisie)
    await page.getByRole('button', { name: 'Entrer' }).click()
    await page.waitForTimeout(500)
  }
}

async function entrerNouvellement(nom: string, numero: string, code: string, rayon: string, mail?: string) {
  await arriverAuCourriel(nom, numero, code, rayon)
  if (mail !== undefined) {
    await page.locator('input.champ__saisie').first().fill(mail)
    await page.getByRole('button', { name: 'Terminer', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Passer', exact: true }).click()
  }
  await page.waitForTimeout(1400)
}

async function sortir() {
  await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
  await page.waitForTimeout(800)
}

/* ============================================================
   1. LE PREMIER COMPTE, AVEC SON COURRIEL
   ============================================================ */
console.log('1. Le premier compte pose son courriel')

ok((await comptes()).length === 0, 'la base part vide')
await entrerNouvellement('Directrice', '9000000001', '12345', 'Médicaments', 'amina@exemple.com')

const apresPremier = await comptes()
ok(apresPremier.length === 1, `le premier compte est cree (${apresPremier.length})`)
ok(apresPremier[0]?.mail === 'amina@exemple.com', `son courriel est enregistre (${apresPremier[0]?.mail})`)
ok(
  (await page.locator('.ecran--connexion').count()) === 0,
  'il ouvre directement, comme avant',
)

/* ============================================================
   2. LE MEME COURRIEL, ECRIT AUTREMENT, EST REFUSE
   ============================================================ */
console.log('\n2. Un second compte ne peut pas prendre la meme adresse')

await sortir()
await arriverAuCourriel('Ibrahim', '9000000002', '22222', 'Ménagers')
await page.locator('input.champ__saisie').first().fill('AMINA@EXEMPLE.COM')
await page.getByRole('button', { name: 'Terminer', exact: true }).click()
await page.waitForTimeout(900)

let texte = await page.locator('body').innerText()
ok(texte.includes('déjà pris'), 'la casse ne trompe pas le controle : le doublon est refuse')
ok((await comptes()).length === 1, 'rien n a ete ecrit : le second compte n existe pas')

/* ---------- Une autre adresse passe ---------- */
await page.locator('input.champ__saisie').first().fill('ibrahim@exemple.com')
await page.getByRole('button', { name: 'Terminer', exact: true }).click()
await page.waitForTimeout(1400)

const apresSecond = await comptes()
ok(apresSecond.length === 2, `le compte s ecrit avec sa propre adresse (${apresSecond.length})`)
ok(
  apresSecond.find((u) => u.nom === 'Ibrahim')?.mail === 'ibrahim@exemple.com',
  'le courriel retenu est celui qui a ete saisi',
)

/* ============================================================
   3. DANS LES REGLAGES, LE MEME CONTROLE
   ============================================================ */
console.log('\n3. Changer son courriel ne prend pas celui d un autre')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(800)

await page.getByLabel('Mon courriel').fill('Amina@Exemple.com')
await page.getByRole('button', { name: 'Enregistrer mon courriel' }).click()
await page.waitForTimeout(700)

texte = await page.locator('body').innerText()
ok(texte.includes('déjà pris'), 'le refus est dit a l ecran')
ok(
  (await comptes()).find((u) => u.nom === 'Ibrahim')?.mail === 'ibrahim@exemple.com',
  'le refus n a rien ecrit : l ancienne adresse reste',
)

await page.getByLabel('Mon courriel').fill('ibrahim2@exemple.com')
await page.getByRole('button', { name: 'Enregistrer mon courriel' }).click()
await page.waitForTimeout(700)

texte = await page.locator('body').innerText()
ok(texte.includes('Courriel enregistré'), 'une adresse libre est acceptee')
ok(
  (await comptes()).find((u) => u.nom === 'Ibrahim')?.mail === 'ibrahim2@exemple.com',
  'la nouvelle adresse est bien en base',
)

await page.locator('.entete__retour').click()
await page.waitForTimeout(600)

/* ============================================================
   4. LE NUMERO DE TELEPHONE, MEME REGLE
   ============================================================ */
console.log('\n4. Un troisieme compte ne peut pas prendre le meme numero')

await sortir()
await arriverAuCourriel('Aicha', '9000000001', '33333', 'Médicaments')
await page.getByRole('button', { name: 'Terminer', exact: true }).click()
await page.waitForTimeout(900)

texte = await page.locator('body').innerText()
ok(texte.includes('Ce numéro est déjà pris'), 'le numero de la directrice est refuse')
ok((await comptes()).length === 2, 'le troisieme compte n a pas ete ecrit')
ok(
  (await comptes()).filter((u) => u.telephone === '9000000001').length === 1,
  'un seul compte porte ce numero',
)

console.log(
  echecs === 0
    ? '\nNUMEROS ET COURRIELS UNIQUES : LA REGLE TIENT A L ECRITURE.'
    : `\n${echecs} ECHEC(S).`,
)
await navigateur.close()
