import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   QUI EST DANS CETTE BASE, ET DANS QUEL ETAT

   Un outil de depannage, pas une verification. Il lit la base et
   affiche ce que l'application ne montre pas d'un coup d'oeil :
   le role exact, le rayon, le numero, le courriel, et l'etat de
   chaque compte.

   Les codes, eux, ne sont plus affiches : l'application ne garde
   qu'une empreinte, et le directeur a un bouton pour remettre
   00000 a qui l'a oublie. */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1500)

/* Une base neuve n'a aucun compte : le premier arrive par l'ecran
   de creation. On le dit, au lieu d'afficher une liste vide sans
   explication. */
const comptes = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  const { etatCompte } = await import('/src/domaine/acces.ts')
  return (await base.utilisateurs.orderBy('nom').toArray()).map((u) => ({
    nom: u.nom,
    role: u.role,
    etat: etatCompte(u),
    telephone: u.telephone ?? '-',
    mail: u.mail ?? '-',
    rayons: u.rayonsAutorises.join(', '),
    essais: u.tentatives ?? 0,
  }))
})

if (comptes.length === 0) {
  console.log('Aucun compte dans cette base.')
  console.log("C'est normal sur un telephone neuf : la premiere personne")
  console.log('cree le sien, et devient directrice.')
} else {
  const largeur = Math.max(...comptes.map((c) => c.nom.length), 8)
  console.log(`${'NOM'.padEnd(largeur)}  ${'ROLE'.padEnd(12)} ${'ETAT'.padEnd(10)} NUMERO       COURRIEL`)
  for (const c of comptes) {
    console.log(
      `${c.nom.padEnd(largeur)}  ${c.role.padEnd(12)} ${c.etat.padEnd(10)} ` +
      `${c.telephone.padEnd(12)} ${c.mail}`,
    )
    console.log(`${''.padEnd(largeur)}  rayons : ${c.rayons} · essais rates : ${c.essais}`)
  }
}

await navigateur.close()
