import { chromium } from 'playwright'

/* ============================================================
   AUCUN NOM DE VARIABLE A L'ECRAN

   Un `{LONGUEUR_CODE}` écrit dans du texte JSX s'affiche tel
   quel : le navigateur ne fait pas d'interpolation dans du
   texte, il faut une accolade fermante. C'est arrive, et c'est
   exactement le genre de defaut qu'on ne voit pas en lisant le
   code — il faut regarder l'ecran.

   Ce script parcourt tous les ecrans et cherche les motifs
   typiques d'une interpolation oubliee. */
const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
let echecs = 0

const MOTIFS = /\{[A-Za-z_$][\w$]*(?:\.[\w$]+)*\}|undefined|NaN|\[object Object\]/

async function inspecter(nom: string) {
  const texte = await page.locator('body').innerText()
  const trouve = texte.match(MOTIFS)
  if (trouve) {
    echecs++
    console.log(`  ECHEC ${nom} : « ${trouve[0]} » visible a l'ecran`)
    const i = texte.indexOf(trouve[0])
    console.log(`     ...${texte.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, ' ')}...`)
  } else {
    console.log(`  OK   ${nom}`)
  }
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await inspecter('connexion')

for (const c of '12345') {
  await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
  await page.waitForTimeout(50)
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1100)
await inspecter('accueil')

/* Tous les ecrans du menu. */
const entrees = await page.locator('.nav-item').all()
const noms: string[] = []
for (const e of entrees) noms.push((await e.innerText()).trim())

for (let i = 0; i < noms.length; i++) {
  await page.locator('.nav-item').nth(i).click()
  await page.waitForTimeout(800)
  await inspecter(noms[i])

  const retour = page.locator('.entete__retour')
  if ((await retour.count()) > 0) {
    await retour.first().click()
    await page.waitForTimeout(600)
  } else {
    await page.locator('.nav-item').first().click()
    await page.waitForTimeout(700)
  }
}

console.log(echecs === 0 ? '\nAUCUN NOM DE VARIABLE A L ECRAN.' : `\n${echecs} ECRAN(S) SALE(S).`)
await navigateur.close()