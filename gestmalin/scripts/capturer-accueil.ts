import { chromium } from 'playwright'
import { creerCompte, prepare, semerStock } from './aide.ts'

/* ============================================================
   L'ACCUEIL EN ENTIER, AVEC DES DONNEES REELLES

   Une capture cadree coupe la page : on ne voit pas la moitie
   basse, celle qui contient justement les tuiles qu'on vient
   d'ajouter. Ici on capture toute la hauteur.

   Le jeu d'essai n'existe plus : le compte et le stock sont poses
   par le script, exactement comme le ferait la premiere personne
   qui ouvre le telephone. */

const CAS = [
  { nom: 'telephone', viewport: { width: 393, height: 852 } },
  { nom: 'bureau', viewport: { width: 1440, height: 900 } },
]

const navigateur = await chromium.launch()

for (const c of CAS) {
  /* Un contexte par capture : chaque cas part d'un telephone neuf,
     au lieu d'heriter des donnees du precedent. */
  const contexte = await navigateur.newContext({ viewport: c.viewport })
  const page = await contexte.newPage()

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await prepare(page)
  await page.waitForTimeout(800)

  await creerCompte(page, { nom: 'Amina', numero: '9000000001', code: '12345' })
  const produits = await semerStock(page)
  await page.waitForTimeout(1200)

  await page.screenshot({ path: `captures/accueil-complet-${c.nom}.png`, fullPage: true })

  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight)
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  console.log(`${c.nom.padEnd(10)} hauteur totale ${hauteur}px, debordement horizontal ${debord}px, ${produits} produits`)
  await contexte.close()
}

console.log('\nCaptures dans captures/accueil-complet-*.png')
await navigateur.close()
