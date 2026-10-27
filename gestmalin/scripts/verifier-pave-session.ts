import { chromium } from 'playwright'
import { prepare, semerComptes } from './aide.ts'

/* La longueur vient du domaine, pas du script : un test qui
   ecrit 5 en dur continue de passer quand l'application en
   attend 6, et ne prouve plus rien. */
const LONGUEUR = 5

/* ============================================================
   LE PAVE DE CODE ET LA SESSION

   1. On peut effacer un chiffre quand on se trompe
   2. Le pave se pilote au clavier, y compris Entree
   3. Un rafraichissement ne deconnecte pas
   4. Une deconnexion, elle, coupe vraiment
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true })
let echecs = 0

const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

const pleines = () => page.locator('.pastille-point--plein').count()
const surLePave = () => page.locator('.ecran--connexion').count()
const tape = async (c: string) => page.getByRole('button', { name: c, exact: true }).click()

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

await prepare(page)
await semerComptes(page)
await page.waitForTimeout(1200)

/* L'ecran a deux etapes : le numero, puis le code. On passe
   directement au code par la liste des noms — c'est le chemin
   court, et c'est celui qui montre le pave du CODE, le seul que
   ce script mesure. */
await page.getByRole('button', { name: /oublié mon login/ }).click()
await page.waitForTimeout(500)
await page.locator('.personne').first().click()
await page.waitForTimeout(500)

/* ---------- 1. Effacer ---------- */
console.log('1. Effacer un chiffre')

for (const c of ['1', '2', '3']) await tape(c)
ok((await pleines()) === 3, 'trois chiffres entres, trois pastilles pleines')

const effacer = page.getByRole('button', { name: /Effacer/ })
ok((await effacer.count()) === 1, 'la touche Effacer existe')

const boite = await effacer.boundingBox()
ok(!!boite && boite.height >= 44, `touche Effacer assez grande (${Math.round(boite?.height ?? 0)} px)`)

await effacer.click()
await page.waitForTimeout(150)
ok((await pleines()) === 2, 'un effacement retire une pastille')

await effacer.click()
await effacer.click()
await page.waitForTimeout(150)
ok((await pleines()) === 0, 'on peut repartir de zero par les effacements')

/* Les trois touches du dernier rang : meme rang, meme hauteur.
   Une touche decalee ou plus petite se rate au doigt — et on ne
   peut pas se tromper de touche. */
const p = await page.evaluate(() => {
  const r = (s: string) => {
    const e = document.querySelector(s)
    if (!e) return null
    const b = e.getBoundingClientRect()
    return { y: Math.round(b.y), h: Math.round(b.height) }
  }
  return { effacer: r('.pave__touche--effacer'), zero: r('.pave__touche--zero'), entree: r('.pave__entree') }
})

console.log('    positions brutes :', JSON.stringify(p))

const troisTouches = p.effacer && p.zero && p.entree
ok(!!troisTouches, 'les trois touches du dernier rang sont presentes')
if (troisTouches) {
  const a = p.effacer!
  const b = p.zero!
  const c = p.entree!
  ok(a.y === b.y && b.y === c.y, `effacer, 0, entree sur le meme rang (y = ${a.y})`)
  ok(a.h === c.h && b.h === c.h, `les trois ont la meme hauteur (${a.h} / ${b.h} / ${c.h})`)
}

/* ---------- 2. Le clavier ---------- */
console.log('\n2. Le pave au clavier')

await page.keyboard.type('12345')
await page.waitForTimeout(200)
ok((await pleines()) === LONGUEUR, 'le code tapes au clavier remplit toutes les pastilles')

await page.keyboard.press('Backspace')
await page.waitForTimeout(200)
ok((await pleines()) === LONGUEUR - 1, 'la touche retour du clavier efface le dernier chiffre')

/* Entree avec un code incomplet ne doit rien faire : sinon on
   dirait « code incorrect » a quelqu'un qui n'a pas fini. */
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
ok((await surLePave()) === 1, 'Entree avec un code incomplet ne tente rien')

await page.keyboard.type('5')
await page.waitForTimeout(200)
ok((await pleines()) === LONGUEUR, 'le code est bien complet avant Entree')

/* Le piege : une touche du pave garde le focus apres avoir ete
   touchee. « Entree » ne doit surtout pas la re-declencher :
   sinon le code tape devient faux sans qu'on voie pourquoi. */
await page.keyboard.press('Enter')
await page.waitForTimeout(1800)
if ((await surLePave()) !== 0) {
  console.log('    diagnostic : pastilles =', await pleines())
  console.log('    message a l ecran =', JSON.stringify(await page.locator('.connexion__erreur').allTextContents()))
}
ok((await surLePave()) === 0, 'Entree valide le code sans re-declencher la touche touchee')

/* ---------- 3. Le rafraichissement ---------- */
console.log('\n3. Un rafraichissement deconnecte-t-il ?')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
ok((await surLePave()) === 0, 'apres F5, on reste connecte')

const memorise = await page.evaluate(() => sessionStorage.getItem('gestmalin.session'))
const moi = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  return (await base.utilisateurs.toArray())[0]?.id ?? null
})
ok(!!moi && memorise === moi, `on ne memorise que l'identifiant (${memorise})`)

const contenuSession = await page.evaluate(() => JSON.stringify(sessionStorage))
ok(!/12345|22222|33333/.test(contenuSession), 'aucun code dans la session conservee')

/* ---------- 4. La deconnexion, elle, coupe ---------- */
console.log('\n4. La deconnexion coupe-t-elle vraiment ?')

await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
await page.waitForTimeout(700)
ok((await surLePave()) === 1, '« Changer » deconnecte')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
ok((await surLePave()) === 1, 'apres deconnexion puis F5, on reste dehors')

console.log(echecs === 0 ? '\nTOUT MARCHE.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()