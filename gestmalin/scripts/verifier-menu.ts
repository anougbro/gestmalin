import { chromium } from 'playwright'
import { connecter } from './aide.ts'

/* ============================================================
   LE MENU SUR TELEPHONE

   Sur telephone, la barre laterale n'existait pas : on ne pouvait
   aller que par les tuiles de l'accueil. Aucun tri, aucun filtre,
   aucun acces direct a un ecran par son nom.

   Le tiroir doit : s'ouvrir, se fermer apres un choix, se fermer
   au voile, se fermer a Echap, et ne pas rester ouvert si on
   change de page.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true })
let echecs = 0

const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

const tiroirOuvert = () => page.locator('.tiroir').count()
const titre = () => page.locator('.entete__titre').first().innerText()

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await connecter(page)

const menu = page.getByRole('button', { name: /Ouvrir le menu/ })
ok((await menu.count()) === 1, 'le bouton menu existe')
const b = await menu.boundingBox()
ok(!!b && b.width >= 44 && b.height >= 44, `assez grand pour le doigt (${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)})`)
ok(await menu.isVisible(), 'visible sur telephone')

console.log('\n2. Ouverture')
await menu.click()
await page.waitForTimeout(500)
ok((await tiroirOuvert()) === 1, 'le tiroir s’ouvre')

const entrees = page.locator('.tiroir .nav-item')
const nombre = await entrees.count()
ok(nombre === 14, `les 14 destinations sont dans le menu (${nombre})`)

ok(await entrees.first().isVisible(), 'les entrées du tiroir sont visibles')

console.log('\n3. Choisir une destination ferme le tiroir')
await entrees.filter({ hasText: 'Réserve froide' }).click()
await page.waitForTimeout(600)
ok((await tiroirOuvert()) === 0, 'le tiroir se referme après un choix')
ok((await titre()).toLowerCase().includes('froide'), `on est sur le bon ecran (« ${await titre()} »)`)

console.log('\n4. Fermeture par le voile')
await menu.click()
await page.waitForTimeout(500)
ok((await tiroirOuvert()) === 1, 'le tiroir se rouvre')
await page.locator('.tiroir__voile').click({ position: { x: 360, y: 400 } })
await page.waitForTimeout(500)
ok((await tiroirOuvert()) === 0, 'toucher en dehors referme')

console.log('\n5. Fermeture au clavier')
await menu.click()
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
ok((await tiroirOuvert()) === 0, 'Echap referme')

console.log('\n6. Le fond ne doit plus defiler tant que le tiroir est ouvert')
await menu.click()
await page.waitForTimeout(500)
const bloque = await page.evaluate(() => getComputedStyle(document.body).overflow)
ok(bloque === 'hidden', `le defilement du fond est bloque (${bloque})`)
const arrierePlan = await page.locator('.tiroir__voile').count()
ok(arrierePlan === 1, 'un voile rend le fond non cliquable')
await page.keyboard.press('Escape')

console.log('\n7. Sur ordinateur, pas de tiroir : la barre laterale est la')
const bureau = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
await bureau.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await connecter(bureau)
await bureau.waitForTimeout(900)
ok((await bureau.locator('.menu-btn').isVisible()) === false, 'le bouton menu est masque sur ordinateur')
ok((await bureau.locator('.barre').isVisible()) === true, 'la barre laterale est presente sur ordinateur')

console.log(echecs === 0 ? '\nLE MENU MARCHE PARTOUT.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()