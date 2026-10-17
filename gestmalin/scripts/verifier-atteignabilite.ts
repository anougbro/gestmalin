import { chromium } from 'playwright'

/* ============================================================
   QU'EST-CE QUI EST ATTEIGNABLE ?

   La verification mobile verifie que ce qu'on voit ne deborde
   pas. Elle ne verifie pas que tout ce qui existe est
   atteignable — et c'est le defaut le plus grave possible :
   un ecran invisible n'est pas un bug d'apparence, c'est une
   fonction qui n'existe pas pour la personne.

   Sur telephone, la barre laterale est masquee : un ecran qui
   n'est pas sur une tuile de l'accueil n'est simplement pas
   accessible.
   ============================================================ */

const TOUS = [
  'Accueil', 'Trouver', 'Réception', 'Ranger', 'Sortie', 'Compter',
  'Produits', 'Alertes', 'Fichiers',
  'À valider', 'Commander', 'Réserve froide', 'Étiquettes', 'Réglages',
]

const navigateur = await chromium.launch()
let problemes = 0

for (const [nom, viewport] of [
  ['telephone', { width: 393, height: 852 }],
  ['bureau', { width: 1440, height: 900 }],
] as const) {
  const page = await navigateur.newPage({ viewport })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  for (const c of ['1', '2', '3', '4', '5']) {
    await page.getByRole('button', { name: c, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)

  /* Une tuile porte le titre ET l'aide : « Trouver Où est un
     produit ». On cherche le titre dans le texte.
     La coupure de defilement ne concerne QUE la barre
     laterale : les tuiles sont dans une grille, pas dans une
     liste qui defile. */
  /* Attention : il y a DEUX systemes de tuiles dans l'application
     — `.geste` sur l'accueil, `.tuile` dans le composant partage.
     En n'en cherchant qu'un, on declare inatteignable des
     destinations qui sont la, juste sous nos yeux. */
  const visibles = await page.evaluate((noms) => {
    const trouves = new Set<string>()
    for (const e of document.querySelectorAll('.geste, .tuile, .nav-item')) {
      const b = e.getBoundingClientRect()
      if (b.height === 0) continue

      const nav = e.closest('.barre__nav')
      if (nav) {
        const nb = nav.getBoundingClientRect()
        if (b.bottom > nb.bottom + 1) continue
      }

      const texte = e.textContent ?? ''
      for (const nom of noms) if (texte.includes(nom)) trouves.add(nom)
    }
    return Array.from(trouves)
  }, TOUS)

  /* « Accueil » n'a pas de tuile : on y est deja. Ce n'est pas
     un ecran manquant. */
  const manquant = TOUS.filter((n) => n !== 'Accueil' && !visibles.includes(n))

  console.log(`\n=== ${nom} (${viewport.width}px) ===`)
  console.log(`  destinations prevues : ${TOUS.length - 1}`)
  console.log(`  atteignables         : ${TOUS.length - 1 - manquant.length}`)
  if (manquant.length) {
    console.log(`  INATTEIGNABLES (${manquant.length}) : ${manquant.join(', ')}`)
    problemes += manquant.length
  } else {
    console.log('  toutes les destinations sont atteignables')
  }

  await page.close()
}

console.log(problemes === 0 ? '\nTOUT EST ATTEIGNABLE.' : `\n${problemes} DESTINATION(S) INATTEIGNABLE(S).`)
await navigateur.close()