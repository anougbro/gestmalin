import { chromium, type Page } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   TROIS DEMANDES
   1. Les deux rayons ne se basculent plus d'un coup de doigt
   2. Le code se change quand on veut, avec confirmation
   3. Sur ordinateur, le menu de gauche va jusqu'en bas de page
   ============================================================ */

const navigateur = await chromium.launch()
let echecs = 0

const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

async function connecter(page: Page, code = '12345') {
  if ((await page.locator('.personne').count()) > 0) {
    await page.locator('.personne').first().click()
    await page.waitForTimeout(300)
  }
  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(50)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1000)
}

/* ---------- 1. Les rayons ---------- */
console.log('1. Ne plus basculer de rayon par erreur')

for (const [nom, vp] of [
  ['telephone', { width: 393, height: 852 }],
  ['bureau', { width: 1440, height: 900 }],
] as const) {
  const page = await navigateur.newPage({ viewport: vp })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await prepare(page)
  await connecter(page)

  const etiquette = page.locator('.rayon-etiquette')
  ok((await etiquette.count()) === 1, `${nom} : le rayon est une etiquette`)

  if (vp.width < 900) {
    ok(await etiquette.isVisible(), `${nom} : le rayon est visible en haut`)
  } else {
    ok(!(await etiquette.isVisible()), `${nom} : sur ordinateur le rayon reste dans la barre laterale`)
  }

  const nomEtiquette = (await etiquette.textContent())?.trim() ?? ''
  const cliquable = page.locator('.app__barre button', { hasText: nomEtiquette })
  ok((await cliquable.count()) === 0, `${nom} : le rayon du haut n'est pas cliquable`)

  /* Des tapes repetees dans la zone du rayon ne doivent rien
     changer : c'est exactement le geste qu'on fait par erreur. */
  for (let i = 0; i < 5; i++) await page.mouse.click(120, 30)
  await page.waitForTimeout(400)
  const apres = (await etiquette.textContent())?.trim() ?? ''
  ok(apres === nomEtiquette, `${nom} : cinq tapes dans le coin ne changent pas de rayon`)

  const dansMenu = page.locator('.barre__rayon .seg-item')
  /* Ce telephone ne gere qu'un seul rayon. Le tiroir montre donc
     UNE pastille, et elle ne doit pas etre un bouton : un bouton
     unique qui ne change rien est un bouton casse. La regle
     « ne pas basculer par megarde » tient mieux ainsi qu'avec
     deux pastilles dont une seule separe vraiment les gens. */
  ok((await dansMenu.count()) === 1, `${nom} : le rayon du telephone est montre`)
  const boutonsRayon = page.locator('.barre__rayon .seg-item[role="tab"]')
  ok((await boutonsRayon.count()) === 0, `${nom} : rien a cliquer pour changer de rayon`)
  const nomAffiche = (await dansMenu.first().innerText()).trim()
  ok(nomAffiche === nomEtiquette, `${nom} : la pastille porte le bon nom (« ${nomAffiche} »)`)

  await page.close()
}

/* ---------- 2. Changer son code ---------- */
console.log('\n2. Changer son code quand on veut')

const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
  await prepare(page)
await connecter(page)
await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(700)

const pave = page.locator('.pave--clair .pave__touche')
const entree = page.locator('.pave--clair .pave__entree')
ok(
  (await pave.count()) === 11 && (await entree.count()) === 1,
  `le pave compte 12 touches (${await pave.count()} + ${await entree.count()})`,
)

const chiffres: string[] = []
for (const t of await pave.all()) {
  const txt = (await t.innerText()).trim()
  if (txt) chiffres.push(txt)
}
const manquant = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].filter((c) => !chiffres.includes(c))
ok(manquant.length === 0, `tous les chiffres sont disponibles (manquants : ${manquant.join(',') || 'aucun'})`)
ok((await page.getByRole('button', { name: /Effacer le dernier/ }).count()) === 1, 'la touche effacer existe ici aussi')

/* La touche du zero porte le nom accessible « Zero » : on vise
   la classe, pas le texte. */
async function saisirCode(code: string, bouton: string) {
  for (const c of code) {
    if (c === '0') await page.locator('.pave--clair .pave__touche--zero').click()
    else await page.locator('.pave--clair .pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
  /* `exact` : l'ecran « A valider » et l'action « Valider » ne
     sont pas la meme cible. */
  await page.getByRole('button', { name: bouton, exact: true }).click()
  await page.waitForTimeout(450)
}

/* Apres la premiere saisie, le bouton devient « Valider ». Au
   retour en arriere — deux codes differents — il redevient
   « Suivant ». C'est le comportement voulu. */
await saisirCode('90715', 'Suivant')
ok((await page.getByText(/Tape le même code/).count()) > 0, 'une deuxieme saisie est demandee')

await saisirCode('12345', 'Valider')
ok((await page.getByText(/pas pareils/i).count()) > 0, 'deux codes differents sont refuses')
ok((await page.getByRole('button', { name: 'Suivant', exact: true }).count()) === 1, 'on repart de la premiere saisie')

await saisirCode('56782', 'Suivant')
await saisirCode('56782', 'Valider')
await page.waitForTimeout(900)
ok((await page.getByText(/Code changé/).count()) > 0, 'le nouveau code est accepte')

await page.getByRole('button', { name: /Changer/ }).last().click()
await page.waitForTimeout(800)
ok((await page.locator('.ecran--connexion').count()) === 1, 'on est deconnecte')

/* Un seul compte : l'ecran va droit au pave, sans liste. */
if ((await page.locator('.personne').count()) > 0) {
  await page.locator('.personne').first().click()
  await page.waitForTimeout(300)
}
for (const c of '56782') {
  await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
  await page.waitForTimeout(60)
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1000)
ok((await page.locator('.ecran--connexion').count()) === 0, 'le nouveau code ouvre la porte')

await page.close()

/* ---------- 3. Le menu de gauche ---------- */
console.log('\n3. Le menu de gauche va jusqu en bas de page')

for (const [nom, vp] of [
  ['court 700', { width: 1440, height: 700 }],
  ['normal 900', { width: 1440, height: 900 }],
  ['large 1080', { width: 1920, height: 1080 }],
] as const) {
  const p = await navigateur.newPage({ viewport: vp })
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await prepare(p)
  await connecter(p)

  const info = await p.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    fenetre: window.innerHeight,
  }))

  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await p.waitForTimeout(400)

  const bas = await p.evaluate(() =>
    Math.round(document.querySelector('.barre')!.getBoundingClientRect().bottom),
  )
  ok(Math.abs(bas - vp.height) <= 2, `${nom} : apres defilement le menu touche le bas (${bas} / ${vp.height}, page ${info.page}px)`)

  await p.close()
}

console.log(echecs === 0 ? '\nLES TROIS DEMANDES SONT TRAITEES.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()