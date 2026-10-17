import { chromium } from 'playwright'

/* ============================================================
   CHANGER DE PERSONNE

   Le bouton « Changer de personne » etait du code mort : il
   vivait dans l'ecran de connexion, qui n'apparaît QUE quand
   personne n'est connecte. Il ne pouvait donc jamais s'afficher,
   ni sur telephone ni sur ordinateur.

   Ce test appuie reellement sur le bouton et verifie qu'on
   revient a l'ecran de connexion avec une liste de personnes.
   ============================================================ */

const CAS = [
  { nom: 'telephone', viewport: { width: 393, height: 852 } },
  { nom: 'bureau', viewport: { width: 1440, height: 900 } },
]

const navigateur = await chromium.launch()
let echecs = 0

for (const c of CAS) {
  const page = await navigateur.newPage({ viewport: c.viewport })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  /* ---- connexion ---- */
  for (const chiffre of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: chiffre, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(800)

  if ((await page.locator('.ecran--connexion').count()) > 0) {
    console.log(`ECHEC ${c.nom} : connexion impossible`)
    echecs++
    await page.close()
    continue
  }

  /* ---- le bouton existe-t-il ? ---- */
  const surMobile = c.viewport.width < 900
  const bouton = surMobile
    ? page.locator('.qui-btn')
    : page.locator('.qui')

  const nb = await bouton.count()
  if (nb === 0) {
    console.log(`ECHEC ${c.nom} : aucun bouton pour changer de personne`)
    echecs++
    await page.close()
    continue
  }

  /* ---- est-il assez grand pour un doigt ? ---- */
  const boite = await bouton.first().boundingBox()
  const largeur = Math.round(boite?.width ?? 0)
  const hauteur = Math.round(boite?.height ?? 0)

  if (largeur < 44 || hauteur < 44) {
    console.log(`ECHEC ${c.nom} : bouton ${largeur}x${hauteur} px, trop petit pour le doigt`)
    echecs++
    await page.close()
    continue
  }
  console.log(`${c.nom.padEnd(10)} bouton ${largeur}x${hauteur} px — assez grand`)

  /* ---- est-il visible a l'ecran ? ---- */
  if (!(await bouton.first().isVisible())) {
    console.log(`ECHEC ${c.nom} : le bouton existe mais ne se voit pas`)
    echecs++
    await page.close()
    continue
  }

  /* ---- est-il visible SANS faire defiler ? ---- */
  /* Une sortie de secours qu'il faut faire defiler pour
     atteindre n'est plus une sortie de secours. */
  const dansFenetre = await page.evaluate((sel) => {
    const e = document.querySelector(sel)
    if (!e) return false
    const b = e.getBoundingClientRect()
    return b.top >= 0 && b.bottom <= window.innerHeight + 1
  }, surMobile ? '.qui-btn' : '.qui')

  if (!dansFenetre) {
    console.log(`ECHEC ${c.nom} : « Changer » est hors de l'ecran, il faut faire defiler`)
    echecs++
    await page.close()
    continue
  }

  /* ---- fonctionne-t-il ? ---- */
  await bouton.first().click()
  await page.waitForTimeout(700)

  if ((await page.locator('.ecran--connexion').count()) === 0) {
    console.log(`ECHEC ${c.nom} : le clic ne deconnecte pas`)
    echecs++
    await page.close()
    continue
  }

  /* ---- apres, voit-on la liste des personnes ? ---- */
  const nbPersonnes = await page.locator('.personne').count()
  console.log(`${c.nom.padEnd(10)} deconnexion OK, ${nbPersonnes} personne(s) proposee(s)`)

  await page.screenshot({ path: `captures/deconnexion-${c.nom}.png` })
  await page.close()
}

console.log(echecs === 0 ? '\nCHANGER DE PERSONNE MARCHE PARTOUT.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()