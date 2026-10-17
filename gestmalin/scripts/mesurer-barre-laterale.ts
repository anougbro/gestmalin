import { chromium } from 'playwright'

/* ============================================================
   LA BARRE LATERALE TIENT-ELLE ?

   Sur un ecran de 900 px de haut, la liste des gestes peut
   deborder. Mesurer le debord, c'est mieux que dire « ca a l'air
   grand » : on sait combien d'entrees sont cachees.
   ============================================================ */

const navigateurs = await chromium.launch()

for (const hauteur of [800, 900, 1080]) {
  const page = await navigateurs.newPage({ viewport: { width: 1440, height: hauteur } })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  for (const c of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: c, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)

  const m = await page.evaluate(() => {
    const nav = document.querySelector('.barre__nav') as HTMLElement | null
    const pied = document.querySelector('.barre__pied') as HTMLElement | null
    const items = Array.from(document.querySelectorAll('.barre__nav .nav-item')) as HTMLElement[]

    const dernier = items[items.length - 1]
    return {
      navVisible: nav ? Math.round(nav.clientHeight) : 0,
      navContenu: nav ? Math.round(nav.scrollHeight) : 0,
      caches: items.filter((i) => {
        const b = i.getBoundingClientRect()
        return b.bottom > (nav?.getBoundingClientRect().bottom ?? 0)
      }).map((i) => i.textContent?.trim()),
      piedVisible: pied ? pied.getBoundingClientRect().bottom <= window.innerHeight + 1 : false,
      dernier: dernier?.textContent?.trim(),
    }
  })

  const deborde = m.navContenu - m.navVisible
  console.log(
    `hauteur ${hauteur}  liste ${m.navVisible}px / contenu ${m.navContenu}px  ` +
    `debordement ${deborde > 0 ? deborde + 'px' : 'aucun'}  pied toujours visible : ${m.piedVisible ? 'OUI' : 'NON'}`,
  )
  if (m.caches.length) console.log(`   hors ecran : ${m.caches.join(', ')}`)

  await page.close()
}

await navigateurs.close()