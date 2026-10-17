import { chromium } from 'playwright'

/* ============================================================
   QUI DEFILE ?

   Si aucun element ne defile, la page est une image fixe : tout
   ce qui est sous la ligne du bas est inatteignable au doigt.
   C'est le pire defaut possible sur un telephone.

   On mesure, pour chaque element, sa hauteur visible et la
   hauteur totale de son contenu, puis on ESSAIE vraiment de
   faire defiler avec la roue et avec le doigt.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

for (const c of ['1', '2', '3', '4']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1000)

const mesures = await page.evaluate(() => {
  const chemins = ['html', 'body', '#root', '.app', '.app__colonne', '.ecran', '.contenu']
  return chemins.map((sel) => {
    const e = document.querySelector(sel)
    if (!e) return { sel, absent: true }
    const c = getComputedStyle(e)
    return {
      sel,
      visible: Math.round(e.clientHeight),
      contenu: Math.round(e.scrollHeight),
      overflowY: c.overflowY,
      deborde: e.scrollHeight - e.clientHeight,
    }
  })
})

console.log('element           visible  contenu  debordement  overflow-y')
console.log('-'.repeat(64))
for (const m of mesures) {
  if (m.absent) { console.log(m.sel.padEnd(16), 'ABSENT'); continue }
  console.log(
    m.sel.padEnd(16),
    String(m.visible).padStart(7),
    String(m.contenu).padStart(8),
    String(m.deborde).padStart(12),
    '  ' + m.overflowY,
  )
}

/* ---- Essai reel, en partant de zero chaque fois ----
   Pousser vers le bas alors qu'on est deja en bas ne prouve
   rien : `scrollTop` ne bouge pas non plus quand la page est
   calee. Il faut repartir de la position haute. */
async function essayer(label: string, geste: () => Promise<void>) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
  const avant = await page.evaluate(() => window.scrollY)
  await geste()
  await page.waitForTimeout(500)
  const apres = await page.evaluate(() => window.scrollY)
  const ok = apres > avant
  console.log(`  ${label.padEnd(18)} ${String(avant).padStart(4)} -> ${String(apres).padStart(4)}  ${ok ? 'defile' : 'NE DEFILE PAS'}`)
  return ok
}

console.log('\nLe document defile-t-il vraiment ?')
const molette = await essayer('molette', () => page.mouse.move(200, 400).then(() => page.mouse.wheel(0, 800)))

/* Un vrai geste tactile. `page.mouse` simule une souris : ce
   n'est pas la meme chose, et Chromium ne defile pas la page la
   ou un doigt glisse. On passe par les evenements tactile
   bruts, ce que fait reellement le telephone. */
const cdp = await page.context().newCDPSession(page)
const doigt = await essayer('geste du doigt', async () => {
  const points = Array.from({ length: 12 }, (_, i) => ({
    x: 200,
    y: 700 - i * 40,
  }))

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
  for (const p of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
})

if (!molette || !doigt) {
  console.log('\nLa page ne defile pas : ce qui est sous la ligne est INATTEIGNABLE.')
  process.exitCode = 1
} else {
  console.log('\nLe document defile des deux facons.')
}

await navigateur.close()
