import { chromium } from 'playwright'

/* ============================================================
   LA BARRE DU HAUT

   Le selecteur de rayon et la pastille de personne doivent etre
   sur la MEME ligne : l'un a gauche, l'autre a droite. Si la
   pastille passe a la ligne, la barre pousse vers le bas et le
   contenu decale — c'est exactement « une incoherence apres
   connexion ».
   ============================================================ */

const CAS = [
  { nom: 'telephone 360', largeur: 360 },
  { nom: 'telephone 393', largeur: 393 },
  { nom: 'telephone 412', largeur: 412 },
  { nom: 'tablette 768', largeur: 768 },
]

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
for (const c of ['1', '2', '3', '4', '5']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)

let problemes = 0

for (const c of CAS) {
  await page.setViewportSize({ width: c.largeur, height: 852 })
  await page.waitForTimeout(350)

  const m = await page.evaluate(() => {
    const rayon = document.querySelector('.app__barre .seg-item') as HTMLElement | null
    const qui = document.querySelector('.qui-btn') as HTMLElement | null
    const barre = document.querySelector('.app__barre') as HTMLElement | null

    const b = (e: HTMLElement | null) => {
      if (!e) return null
      const r = e.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    return {
      rayon: b(rayon),
      qui: b(qui),
      barre: b(barre),
      hauteurBarre: barre ? Math.round(barre.getBoundingClientRect().height) : 0,
    }
  })

  if (!m.rayon || !m.qui) {
    console.log(`${c.nom.padEnd(15)} ABSENT  rayon=${!!m.rayon} qui=${!!m.qui}`)
    problemes++
    continue
  }

  const memeLigne = Math.abs(m.rayon.y - m.qui.y) < 4
  const quiADroite = m.qui.x > m.rayon.x
  const deborde = (m.barre?.w ?? 0) > c.largeur

  const etat = memeLigne && quiADroite && !deborde ? 'OK' : 'PROBLEME'
  if (etat !== 'OK') problemes++

  console.log(
    `${c.nom.padEnd(15)} ${etat.padEnd(9)} barre h=${String(m.hauteurBarre).padStart(3)}  ` +
    `rayon(x=${m.rayon.x} y=${m.rayon.y} ${m.rayon.w}x${m.rayon.h})  ` +
    `qui(x=${m.qui.x} y=${m.qui.y} ${m.qui.w}x${m.qui.h})  ` +
    `${memeLigne ? '' : 'PAS SUR LA MEME LIGNE '}${quiADroite ? '' : 'PAS A DROITE '}${deborde ? 'DEBORDE' : ''}`,
  )
}

console.log(problemes === 0 ? '\nLA BARRE DU HAUT EST CORRECTE PARTOUT.' : `\n${problemes} PROBLEME(S).`)
await navigateur.close()