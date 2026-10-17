import { chromium } from 'playwright'

/* ============================================================
   QUI RETRECIT L'APPLICATION ?

   On remonte la chaine html > body > #root > .app et on mesure
   chaque element avec sa largeur REELLE et sa largeur IMPOSEE
   par le navigateur. L'element ou les deux divergent est celui
   qui bloque.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
for (const c of ['1', '2', '3', '4']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)

const infos = await page.evaluate(() => {
  const chemins = ['html', 'body', '#root', '.app', '.app__colonne', '.app__barre', '.ecran', '.contenu']

  return chemins.map((sel) => {
    const e = document.querySelector(sel)
    if (!e) return { sel, absent: true }

    const b = e.getBoundingClientRect()
    const c = getComputedStyle(e)
    return {
      sel,
      largeur: Math.round(b.width),
      imposée: Math.round(e.clientWidth),
      scroll: e.scrollWidth,
      display: c.display,
      maxWidth: c.maxWidth,
      padding: `${c.paddingLeft}/${c.paddingRight}`,
      flex: c.flex,
      alignItems: c.alignItems,
      position: c.position,
    }
  })
})

console.log('selecteur        largeur  scroll  display   max-width  padding   flex')
console.log('-'.repeat(78))
for (const i of infos) {
  if (i.absent) { console.log(i.sel.padEnd(16), 'ABSENT'); continue }
  console.log(
    i.sel.padEnd(16),
    String(i.largeur).padStart(6),
    String(i.scroll).padStart(7),
    i.display.padEnd(9),
    i.maxWidth.padEnd(10),
    i.padding.padEnd(10),
    i.flex,
  )
}

console.log('\nlargeur de la fenetre :', await page.evaluate(() => document.documentElement.clientWidth))
await navigateur.close()