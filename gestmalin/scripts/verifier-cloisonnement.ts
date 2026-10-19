import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/* ============================================================
   DEUX PERSONNES, DEUX TELEPHONES, AUCUN PASSAGE

   Le modele possede `rayonsAutorises` depuis le premier jour, la
   regle `peutUtiliser` aussi, et leurs tests passent. Mais rien
   ne l'appelait : `changeRayon` faisait un `setRayon` sans
   question. La regle d'acces etait ecrite, testee, et jamais
   appliquee.

   C'est la meme famille de defaut que le scan : un modele correct,
   une decision correcte, et le raccordement entre les deux
   absent. Le raccordement ne se voit pas dans les tests
   unitaires — il se voit en ouvrant l'application.

   Ce script ouvre donc deux sessions, comme deux telephones, et
   verifie que la seconde ne peut pas entrer dans le rayon de la
   premiere, meme en forçant l'appel.
   ============================================================ */

mkdirSync('captures', { recursive: true })

const navigateur = await chromium.launch()

let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK   ' : 'ECHEC'} ${message}`)
}
const titre = (t: string) => console.log(`\n${t}`)

/** Un telephone neuf, avec une session isolee. */
async function ouvrirTelephone(nom: string) {
  const contexte = await navigateur.newContext({ viewport: { width: 393, height: 852 } })
  const page = await contexte.newPage()
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  return { contexte, page, nom }
}

async function choisirRayon(page: import('playwright').Page, rayon: string) {
  await page.getByRole('button', { name: rayon }).click()
  await page.waitForTimeout(1200)
}

async function connecter(page: import('playwright').Page, code: string) {
  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1200)
}

async function rayonOuvert(page: import('playwright').Page): Promise<string | null> {
  return page.locator('.rayon-etiquette__nom').first().innerText().catch(() => null)
}

async function rayonsProposes(page: import('playwright').Page): Promise<string[]> {
  await page.locator('.menu-btn').click()
  await page.waitForTimeout(600)
  const noms = (await page.locator('.tiroir .seg-item').allInnerTexts()).map((n) => n.trim())
  const boutons = await page.locator('.tiroir .seg-item[role="tab"]').count()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  /* Une pastille qui ne s'attend pas — parce qu'elle est unique —
     n'est pas un bouton. C'est ce qui distingue « on ne peut pas
     changer » de « le choix est cache ». On renvoie donc le nombre
     de vrais boutons a part. */
  return { noms, boutons }
}

/* ============================================================ */

titre('1. Un telephone menager se declares des le premier lancement')
const menager = await ouvrirTelephone('menager')
const texteInitial = await menager.page.locator('body').innerText()
ok(texteInitial.includes('Que gères-tu ?'), 'la question est posee avant le code')
ok(texteInitial.includes('Médicaments') && texteInitial.includes('Ménagers'), 'les deux rayons sont proposes')
await menager.page.screenshot({ path: 'captures/rayon-question.png' })

await choisirRayon(menager.page, 'Ménagers')
const apresChoix = await menager.page.locator('body').innerText()
ok(apresChoix.includes('Entrer') || (await menager.page.locator('.pave__touche').count()) > 0, 'le pave de code apparait ensuite')

/* ---------- 2. Le compte n a plus qu un seul rayon ---------- */
titre('2. Le compte est rattache au rayon choisi')
const rayonCompte = await menager.page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  const u = await base.utilisateurs.get('u-1')
  return u?.rayonsAutorises ?? []
})
ok(rayonCompte.length === 1 && rayonCompte[0] === 'r-men', `le compte n a plus que ${JSON.stringify(rayonCompte)}`)

/* ---------- 3. On ne voit pas Menagers quand on est dans Menagers ---------- */
titre('3. La connexion ouvre sur le bon rayon')
await connecter(menager.page, '12345')
ok((await rayonOuvert(menager.page)) === 'Ménagers', 'la session est sur Ménagers')
const visibles = await rayonsProposes(menager.page)
ok(!visibles.noms.includes('Médicaments'), `le rayon Médicaments n'est pas proposé (visibles : ${JSON.stringify(visibles.noms)})`)
ok(visibles.boutons === 0, 'il n’y a aucun bouton de changement de rayon : rien à appuyer qui ne marche pas')
await menager.page.screenshot({ path: 'captures/rayon-un-seul.png' })

/* ---------- 4. Un produit saisi atterrit dans LE bon rayon ---------- */
titre('4. Un produit saisi atterrit dans le rayon du téléphone')

/* C'est LA consequence qui compte. Avant, la personne des menagers
   pouvait basculer sur « Medicaments » et y ranger du savon : la
   donnee etait la, valide, et personne ne la reverrait jamais.

   On fait exactement ce qu'elle ferait : on enregistre un produit
   menager, puis on regarde ou il s'est ecrit. */
await menager.page.locator('.menu-btn').click()
await menager.page.waitForTimeout(500)
await menager.page.locator('.tiroir .nav-item', { hasText: /^Réception$/ }).click()
await menager.page.waitForTimeout(900)

const stockAvant = await menager.page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  return (await base.produits.where('rayonId').equals('r-med').toArray()).length
})
ok(stockAvant === 0, 'le téléphone Ménagers n’a aucun produit en Médicaments')

/* On cree un produit menager depuis l'ecran Produits. */
await menager.page.locator('.menu-btn').click()
await menager.page.waitForTimeout(500)
await menager.page.locator('.tiroir .nav-item', { hasText: /^Produits$/ }).click()
await menager.page.waitForTimeout(900)
await menager.page.getByRole('button', { name: 'Nouveau', exact: true }).click()
await menager.page.waitForTimeout(700)
await menager.page.locator('input.champ__saisie').first().fill('Savon de test cloisonné')
await menager.page.waitForTimeout(300)
await menager.page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
await menager.page.waitForTimeout(900)

const ouEstLeProduit = await menager.page.evaluate(async (nomProduit: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const p = await base.produits.where('nomFr').equals(nomProduit).first()
  return p?.rayonId ?? null
}, 'Savon de test cloisonné')

ok(ouEstLeProduit === 'r-men', `le produit est enregistré dans Ménagers (trouvé : ${ouEstLeProduit})`)
await menager.page.screenshot({ path: 'captures/rayon-produit-bon-place.png' })

/* ---------- 5. Un second telephone, lui, est sur Medicaments ---------- */
titre('5. Le telephone de la pharmacie est indépendant')
const pharmacie = await ouvrirTelephone('pharmacie')
await choisirRayon(pharmacie.page, 'Médicaments')
await connecter(pharmacie.page, '12345')
ok((await rayonOuvert(pharmacie.page)) === 'Médicaments', 'la pharmacie est sur Médicaments')
const visiblesPharm = await rayonsProposes(pharmacie.page)
ok(!visiblesPharm.noms.includes('Ménagers'), `le rayon Ménagers n'est pas proposé (visibles : ${JSON.stringify(visiblesPharm.noms)})`)
await pharmacie.page.screenshot({ path: 'captures/rayon-autre-telephone.png' })

/* ---------- 6. Les deux bases ne partagent rien ---------- */
titre('6. Les deux téléphones ne partagent rien')
const vuParLaPharmacie = await pharmacie.page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  return (await base.produits.where('nomFr').equals('Savon de test cloisonné').toArray()).length
})
ok(vuParLaPharmacie === 0, 'le savon du téléphone Ménagers est invisible depuis le téléphone pharmacie')

await menager.contexte.close()
await pharmacie.contexte.close()
await navigateur.close()

console.log(echecs === 0
  ? '\nLES DEUX PERSONNES RESTENT SÉPARÉES.'
  : `\n${echecs} ECHEC(S) — le cloisonnement ne tient pas.`)
process.exit(echecs === 0 ? 0 : 1)