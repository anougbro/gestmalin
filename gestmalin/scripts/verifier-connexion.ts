import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LA CONNEXION, DANS UN VRAI NAVIGATEUR

   Les tests unitaires prouvent que la comparaison du code est
   juste. Ils ne prouvent pas qu'un doigt peut se connecter sur
   un ecran reel.

   Ce script fait exactement ce que fait un humain : il appuie
   sur les touches du pave, puis sur « Entrer ».
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })

const erreurs: string[] = []
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => erreurs.push((e.stack ?? e.message).slice(0, 900)))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

await prepare(page)
await page.waitForTimeout(1200)

/* ---- 1. L'ecran de connexion est bien la ---- */
const pave = page.locator('.pave__touche')
if ((await pave.count()) === 0) {
  console.log('ECHEC : pas d ecran de connexion')
  await navigateur.close()
  process.exit(1)
}
console.log('OK  pavé de chiffres affiché, ' + (await pave.count()) + ' touches')

/* ---- 2. Le bouton « Entrer » existe et commence inactif ---- */
const entrer = page.getByRole('button', { name: 'Entrer' })
if (!(await entrer.isDisabled())) {
  console.log('ECHEC : « Entrer » est actif avec un code incomplet')
  process.exit(1)
}
console.log('OK  « Entrer » inactif tant que le code est incomplet')

/* ---- 3. Un code faux doit etre refuse, et le dire ---- */
for (const c of ['9', '9', '9', '9', '9']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
if (await entrer.isDisabled()) {
  console.log('ECHEC : « Entrer » reste inactif avec un code incomplet')
  process.exit(1)
}
await entrer.click()
await page.waitForTimeout(600)

const erreurAffichee = await page.locator('.connexion__erreur').count()
if (erreurAffichee === 0) {
  console.log('ECHEC : un code faux ne donne aucun message')
  console.log('  erreurs console : ' + JSON.stringify(erreurs, null, 2))
  console.log('  HTML du pave     : ' + (await page.locator('.connexion').innerHTML()).slice(0, 900))
  await page.screenshot({ path: 'captures/connexion-echec.png' })
  process.exit(1)
}
console.log('OK  un code faux affiche un message')

/* ---- 4. Le bon code doit laisser entrer ---- */
for (const c of ['1', '2', '3', '4', '5']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)

const connexion = await page.locator('.ecran--connexion').count()
if (connexion > 0) {
  console.log('ECHEC : le bon code n a pas laisse entrer')
  await page.screenshot({ path: 'captures/connexion-echec.png' })
  process.exit(1)
}
console.log('OK  le code 12345 laisse entrer')

/* ---- 5. Une fois dedans, on voit l'accueil ---- */
const accueil = await page.locator('.accueil').count()
if (accueil === 0) {
  console.log('ECHEC : pas d accueil apres connexion')
  process.exit(1)
}
console.log('OK  accueil affiché')

await page.screenshot({ path: 'captures/connexion-ok.png' })

if (erreurs.length > 0) {
  console.log('\nERREURS CONSOLE :')
  for (const e of erreurs) console.log('  ' + e)
}

console.log('\nLA CONNEXION FONCTIONNE.')
await navigateur.close()