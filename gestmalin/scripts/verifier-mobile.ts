/* ============================================================
   Verifier l'affichage sur un telephone

   On ne se fie pas a « ca devrait marcher » : on ouvre
   reellement l'application dans un navigateur a la taille d'un
   telephone, et on regarde ce qui deborde.

   Les tailles testes correspondent aux telephones courants au
   Niger : 360 px de large, c'est le plus petit ecran qu'on
   rencontre encore souvent.
   ============================================================ */

import { chromium, devices, type Page } from 'playwright'
import { connecterParNom, prepare, semerComptes } from './aide.ts'
import { mkdirSync } from 'node:fs'

const SORTIE = 'captures'
mkdirSync(SORTIE, { recursive: true })

const TAILLES = [{ nom: 'petit-360', largeur: 360, hauteur: 800, echelle: 2 }, { nom: 'moyen-393', largeur: 393, hauteur: 852, echelle: 2 }, { nom: 'grand-412', largeur: 412, hauteur: 915, echelle: 2 }, { nom: 'bureau-1440', largeur: 1440, hauteur: 900, echelle: 1 }] as const

const navigateur = await chromium.launch()
const problemes: string[] = []

/* Depuis la phase 5, l'application demande un code a 4 chiffres.
   Les tests doivent donc se connecter : sinon ils explorent un
   ecran de connexion et concluent que tout est inaccessible. */
async function connecter(page: Page) {
  /* La session survit au rechargement. Si on est deja entre, il
     n'y a plus de pave : demander une connexion echouerait sur un
     ecran qui n'existe pas. */
  if ((await page.locator('.pave__touche').count()) === 0) return
  await connecterParNom(page, 'Préparateur', '12345')
}

for (const t of TAILLES) {
  const contexte = await navigateur.newContext({
    ...devices['Pixel 5'],
    viewport: { width: t.largeur, height: t.hauteur },
    deviceScaleFactor: t.echelle,
    isMobile: t.largeur < 900,
    locale: 'fr',
  })
  const page = await contexte.newPage()
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await prepare(page)
  await semerComptes(page)
  await connecter(page)
  await page.waitForTimeout(900)

  await page.screenshot({ path: `${SORTIE}/${t.nom}-accueil.png`, fullPage: true })

  /* Un element qui depasse horizontalement casse toute la page.
     On le cherche en comparant la largeur de chaque bloc a celle
     de la fenetre. */
  const debordements = await page.evaluate(() => {
    const largeur = document.documentElement.clientWidth
    const coupables: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.right > largeur + 1 || r.left < -1) {
        coupables.push(`${el.tagName.toLowerCase()}.${el.className || '(sans classe)'} — ${Math.round(r.left)}..${Math.round(r.right)} pour ${largeur}`)
      }
    }
    return coupables.slice(0, 8)
  })

  const defilement = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    largeurPage: document.documentElement.scrollWidth,
    largeurFenetre: document.documentElement.clientWidth,
  }))

  if (defilement.horizontal) {
    problemes.push(
      `${t.nom} : defilement horizontal (page ${defilement.largeurPage}px pour une fenetre de ${defilement.largeurFenetre}px)`,
    )
  }
  for (const d of debordements) problemes.push(`${t.nom} : debordement — ${d}`)

  /* Les cibles tactiles : moins de 44 px, c'est dur au doigt. */
  const petits = await page.evaluate(() => {
    const tropPetits: string[] = []
    for (const el of Array.from(document.querySelectorAll('button, a, input, select'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 44 || r.width < 44) {
        tropPetits.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 22)}" — ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return tropPetits.slice(0, 8)
  })
  for (const p of petits) problemes.push(`${t.nom} : cible trop petite — ${p}`)

  /* On traverse aussi les autres ecrans : un probleme peut
     n'apparaitre que sur la reception ou le comptage.

     `visible=true` est indispensable : la barre laterale reste
     dans le DOM sur telephone, seulement masquee. Sans ce filtre,
     on cliquerait un bouton qu'on ne voit pas. */
  for (const nomEcran of ['Réception', 'Trouver', 'Sortie', 'Compter', 'Alertes', 'Produits', 'Fichiers']) {
    const bouton = page.getByRole('button', { name: nomEcran, exact: true }).locator('visible=true').first()
    if (!(await bouton.count())) {
      problemes.push(`${t.nom} / ${nomEcran} : ecran inaccessible`)
      continue
    }
    await bouton.click()
    await page.waitForTimeout(700)
    const fichier = nomEcran.toLowerCase().replace(/[^a-z]/g, '')
    await page.screenshot({ path: `${SORTIE}/${t.nom}-${fichier}.png`, fullPage: true })

    const deborde = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth)
    if (deborde) problemes.push(`${t.nom} / ${nomEcran} : defilement horizontal`)

    /* Les cibles tactiles, ECRAN PAR ECRAN : c'est la que se
       trouvent les vrais boutons de l'action. */
    const petits = await page.evaluate(() => {
      const tropPetits: string[] = []
      for (const el of Array.from(document.querySelectorAll('button, a, input, select'))) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height < 44 || r.width < 44) {
          tropPetits.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 22)}" — ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
      return tropPetits.slice(0, 6)
    })
    for (const p of petits) problemes.push(`${t.nom} / ${nomEcran} : cible trop petite — ${p}`)

    /* Retour a l'accueil : on separe chaque ecran par une
       navigation complete, pas par un retour dans l'historique. */
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
      await connecter(page)
    await page.waitForTimeout(400)
  }

  await contexte.close()
}

await navigateur.close()

if (problemes.length === 0) {
  console.log('AUCUN PROBLEME : tout tient dans les trois largeurs.')
} else {
  console.log(`${problemes.length} PROBLEME(S) :`)
  for (const p of problemes) console.log(' - ' + p)
}
console.log(`Captures dans ${SORTIE}/`)
