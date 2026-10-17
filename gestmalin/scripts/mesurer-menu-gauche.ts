import { chromium } from 'playwright'

/* ============================================================
   LA BARRE GAUCHE ARRIVE-T-ELLE EN BAS DE PAGE ?

   Elle est en `height: 100vh`. Sur une page plus haute que la
   fenetre, elle s'arrete a la hauteur de la fenetre et laisse
   la couleur de fond en dessous : une bande grise en bas a
   gauche, sous le bord de la barre.

   On mesure la hauteur reelle du menu contre celle de la page.
   ============================================================ */

const navigateur = await chromium.launch()

for (const [nom, viewport] of [
  ['bureau court 1440x700', { width: 1440, height: 700 }],
  ['bureau normal 1440x900', { width: 1440, height: 900 }],
  ['bureau large 1920x1080', { width: 1920, height: 1080 }],
] as const) {
  const page = await navigateur.newPage({ viewport })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  for (const c of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: c, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1200)

  const m = await page.evaluate(() => {
    const barre = document.querySelector('.barre')
    const app = document.querySelector('.app')
    if (!barre || !app) return null
    const bb = barre.getBoundingClientRect()
    const ab = app.getBoundingClientRect()
    return {
      barreH: Math.round(bb.height),
      barreBas: Math.round(bb.bottom),
      appH: Math.round(ab.height),
      pageH: document.documentElement.scrollHeight,
      fenetre: window.innerHeight,
    }
  })

  if (!m) { console.log(`${nom.padEnd(26)} barre absente`); await page.close(); continue }

  /* En faisant defiler en bas, la barre doit toujours toucher le
     bas de la fenetre. */
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const enBas = await page.evaluate(() => {
    const b = document.querySelector('.barre')?.getBoundingClientRect()
    return b ? Math.round(b.bottom) : 0
  })

  const colle = Math.abs(enBas - viewport.height) <= 2
  const atteint = m.barreH >= Math.min(m.pageH, m.fenetre)

  console.log(
    `${nom.padEnd(26)} barre ${String(m.barreH).padStart(4)}px  page ${String(m.pageH).padStart(4)}px  ` +
    `apres defilement, bas de la barre a ${String(enBas).padStart(4)} / fenetre ${viewport.height}  ` +
    `${atteint ? 'hauteur OK' : 'TROP COURTE'} ${colle ? 'collee au bas' : 'LAISSE UNE BANDE'}`,
  )

  await page.close()
}

await navigateur.close()