import { chromium } from 'playwright'

/* ============================================================
   L'ACCUEIL EN ENTIER, AVEC DES DONNEES

   Une capture cadree coupe la page : on ne voit pas la moitié
   basse, celle qui contient justement les tuiles qu'on vient
   d'ajouter. Ici on capture toute la hauteur.
   ============================================================ */

const CAS = [
  { nom: 'telephone', viewport: { width: 393, height: 852 }, bureau: false },
  { nom: 'bureau', viewport: { width: 1440, height: 900 }, bureau: true },
]

const navigateur = await chromium.launch()

for (const c of CAS) {
  const page = await navigateur.newPage({ viewport: c.viewport })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  /* On charge le jeu d'essai pour voir l'accueil peuple. */
  await page.getByRole('button', { name: /^1$/ }).click()
  await page.getByRole('button', { name: /^2$/ }).click()
  await page.getByRole('button', { name: /^3$/ }).click()
  await page.getByRole('button', { name: /^4$/ }).click()
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)

  await page.getByRole('button', { name: 'Réglages' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /Charger le jeu/ }).click()
  await page.waitForTimeout(1800)

  /* Retour a l'accueil : sur telephone, on recharge — ce qui
     deconnecte, par choix (appareil partage, pas de session
     conservee). Il faut donc se reconnecter. */
  if (c.bureau) {
    await page.getByRole('button', { name: 'Accueil' }).first().click()
  } else {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.locator('.personne', { hasText: 'Préparateur' }).first().click()
    await page.waitForTimeout(250)
    for (const chiffre of ['1', '2', '3', '4']) {
      await page.getByRole('button', { name: chiffre, exact: true }).click()
    }
    await page.getByRole('button', { name: 'Entrer' }).click()
  }
  await page.waitForTimeout(1200)

  await page.screenshot({ path: `captures/accueil-complet-${c.nom}.png`, fullPage: true })

  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight)
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  console.log(`${c.nom.padEnd(10)} hauteur totale ${hauteur}px, debordement horizontal ${debord}px`)
  await page.close()
}

console.log('\nCaptures dans captures/accueil-complet-*.png')
await navigateur.close()