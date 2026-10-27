import { chromium } from 'playwright'
import {
  connecterParNom, prepare, semerComptes, type CompteSeme,
} from './aide.ts'

/* ============================================================
   LES CODES NE SONT PLUS ECRITS DANS L'APPLICATION

   Le jeu d'essai est parti, et avec lui la liste des mots de
   passe affiches. C'est volontaire : l'application ne stocke
   qu'une empreinte, elle ne peut donc pas dire quel code a ete
   choisi.

   Le directeur garde un recours : remettre a une personne le
   code provisoire 00000. Ce script verifie que le bouton existe,
   qu'il ecrit vraiment en base, et que l'ancien code ne passe
   plus apres.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

function empreinte(id: string, code: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const graine = `${id}:${code}`
  for (let i = 0; i < graine.length; i++) {
    const c = graine.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0
  }
  let h3 = 0
  for (let i = 0; i < 'gestmalin'.length; i++) h3 = (Math.imul(h3, 31) + 'gestmalin'.charCodeAt(i)) >>> 0
  return [h1, h2, h3].map((n) => n.toString(36)).join('-')
}

const DIRECTRICE: CompteSeme = {
  id: 'u-dir', nom: 'Directrice', role: 'directeur',
  telephone: '9000000001', code: '12345', rayons: ['r-med', 'r-men'],
}
const AMINA: CompteSeme = {
  id: 'u-ami', nom: 'Amina', role: 'preparateur',
  telephone: '9000000002', code: '44444', rayons: ['r-men'],
}

async function taper(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(55)
  }
}

async function entrerParNumero(numero: string, code: string) {
  await taper(numero)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)
  await taper(code)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

async function sortir() {
  await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
  await page.waitForTimeout(900)
}

const enBase = (id: string) => page.evaluate(async (cle: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const u = await base.utilisateurs.get(cle)
  return u ? { empreinte: u.empreinte, longueurCode: u.longueurCode } : null
}, id)

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await semerComptes(page, [DIRECTRICE, AMINA])
await page.waitForTimeout(600)

/* ---------- 1. La liste des comptes ---------- */
console.log('\n1. Les comptes, sans leurs codes')
await connecterParNom(page, 'Directrice', '12345')
ok((await page.locator('.ecran--connexion').count()) === 0, 'la directrice entre')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(900)

const lignes = page.locator('[data-compte]')
ok((await lignes.count()) === 2, `la liste montre les deux comptes (${await lignes.count()})`)
ok(
  (await page.getByText('Personnes et mots de passe', { exact: true }).count()) === 0,
  'aucune liste de mots de passe n est affichee',
)
ok(
  (await page.locator('.codes__code').count()) === 0,
  'aucun code en clair n est ecrit a l ecran',
)
ok(
  (await page.locator('[data-etat-compte="actif"]').count()) === 2,
  'les deux comptes sont marques actifs',
)
await page.screenshot({ path: 'captures/comptes-liste.png', fullPage: true })

/* ---------- 2. Remettre 00000 a une personne ---------- */
console.log('\n2. Le directeur remet le code provisoire')
const ligneAmina = page.locator('[data-compte]', { hasText: 'Amina' }).first()
await ligneAmina.getByRole('button', { name: 'Code 00000' }).click()
await page.waitForTimeout(1000)

const apres = await enBase('u-ami')
ok(
  apres?.empreinte === empreinte('u-ami', '00000'),
  'la base porte bien l empreinte de 00000',
)
ok(apres?.longueurCode === 5, `le code fait cinq chiffres (${apres?.longueurCode})`)

/* ---------- 3. Le nouveau code ouvre, l'ancien non ---------- */
console.log('\n3. Le nouveau code ouvre, l ancien non')

await page.locator('.entete__retour').click()
await page.waitForTimeout(600)
await sortir()
await entrerParNumero('9000000002', '00000')
ok((await page.locator('.ecran--connexion').count()) === 0, 'Amina entre avec 00000')

await sortir()
await entrerParNumero('9000000002', '44444')
const texte = await page.locator('body').innerText()
ok((await page.locator('.ecran--connexion').count()) === 1, 'la porte reste fermee avec l ancien code')
ok(texte.includes('Mot de passe incorrect'), 'le refus est dit clairement')

console.log(echecs === 0
  ? '\nLES CODES SE REMETTENT, SANS JAMAIS S ECRIRE A L ECRAN.'
  : `\n${echecs} ECHEC(S).`)
await navigateur.close()
process.exit(echecs === 0 ? 0 : 1)
