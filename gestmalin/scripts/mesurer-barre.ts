import { chromium } from 'playwright'

/* ============================================================
   LA BARRE VERTE REMPLIT-ELLE LA LARGEUR ?

   On ne juge pas a l'oeil sur une capture : on mesure.
   La barre du haut doit s'etaler sur toute la largeur de la
   colonne, sans deborder, sans laisser de bande vide, et sans
   depasser la fenetre.

   On mesure aussi si le contenu peut deborder horizontalement :
   c'est ce qui donne l'impression que « ca ne remplit pas ».
   ============================================================ */

const LARGEURS = [360, 393, 412, 768, 900, 1024, 1280, 1440, 1920]

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
for (const c of ['1', '2', '3', '4']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)

console.log('largeur  app      barre    ecran    ecart_g  debord   ecran-barre  apercu')
console.log('-'.repeat(84))

for (const l of LARGEURS) {
  await page.setViewportSize({ width: l, height: 900 })
  await page.waitForTimeout(350)

  const m = await page.evaluate(() => {
    const r = (s: string) => {
      const e = document.querySelector(s)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { l: b.left, r: b.right, w: b.width, visible: getComputedStyle(e).display !== 'none' }
    }
    const doc = document.documentElement
    return {
      app: r('.app'),
      barre: r('.app__barre'),
      ecran: r('.ecran'),
      fenetre: doc.clientWidth,
      debord: Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth,
    }
  })

  const f = (n: number | undefined) => (n === undefined ? '   -' : String(Math.round(n)).padStart(6))
  const ecart = m.app && m.barre ? m.barre.l - m.app.l : undefined
  const manque = m.app && m.barre ? m.app.r - m.barre.r : undefined

  console.log(
    [
      String(l).padStart(7),
      f(m.app?.w),
      f(m.barre?.w) + (m.barre?.visible === false ? '*' : ' '),
      f(m.ecran?.w),
      f(ecart),
      String(m.debord).padStart(6),
      String(Math.round(manque ?? 0)).padStart(9),
    ].join('  '),
  )
}

console.log('\n* = barre masquee a cette largeur (normal sur ordinateur)')

await navigateur.close()