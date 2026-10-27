import { chromium } from 'playwright'
import { prepare, semerComptes, type CompteSeme } from './aide.ts'

/* ============================================================
   LE BLOCAGE APRES CINQ ESSAIS

   Cinq mauvais mots de passe, puis le compte se ferme quinze
   minutes. Un directeur peut le rouvrir tout de suite, depuis les
   reglages, sur le telephone — il n'y a pas de serveur pour le
   faire a distance.

   Ce qui doit etre vrai a la fin :
     - le compteur se voit (il reste N essais) ;
     - un compte bloque refuse MEME le bon mot de passe ;
     - le directeur debloque, et la personne rentre ;
     - « Remettre 00000 » rend un mot de passe provisoire, et
       l'ancien ne marche plus.
   ============================================================ */

const DIRECTRICE: CompteSeme = {
  id: 'u-dir',
  nom: 'Amina',
  role: 'directeur',
  telephone: '9000000001',
  code: '12345',
  rayons: ['r-med', 'r-men'],
}

const BLOQUE: CompteSeme = {
  id: 'u-bloque',
  nom: 'Ibrahim',
  role: 'preparateur',
  telephone: '9000000002',
  code: '54321',
  rayons: ['r-men'],
}

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

const corps = () => page.locator('body').innerText()

async function chiffres(s: string) {
  for (const c of s) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(40)
  }
}

async function entrer() {
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(400)
}

async function ouvrirLogin(numero: string) {
  await chiffres(numero)
  await entrer()
  await page.waitForTimeout(300)
}

async function essayer(code: string) {
  await chiffres(code)
  await entrer()
}

async function sortir() {
  if ((await page.locator('.qui-btn-lg').count()) === 0) {
    /* Depuis les reglages : on revient d'abord a l'accueil, seule
       page qui porte le gros bouton « Changer ». */
    const retour = page.locator('.entete__retour')
    if (await retour.count()) {
      await retour.click()
      await page.waitForTimeout(700)
    }
  }
  await page.locator('.qui-btn-lg').click()
  await page.waitForTimeout(700)
}

async function reglages() {
  await page.getByRole('button', { name: 'Réglages' }).first().click()
  await page.waitForTimeout(900)
}

async function etat(id: string) {
  return page.evaluate(async (identifiant: string) => {
    const { base } = await import('/src/donnees/base.ts')
    const u = await base.utilisateurs.get(identifiant)
    return u ? { tentatives: u.tentatives ?? 0, bloque: (u.bloqueJusqua ?? 0) > Date.now() } : null
  }, id)
}

async function reviserLogin() {
  const retour = page.getByRole('button', { name: 'Retour' })
  if (await retour.count()) {
    await retour.click()
    await page.waitForTimeout(500)
  }
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await semerComptes(page, [DIRECTRICE, BLOQUE])

console.log('1. Cinq mauvais mots de passe')
await ouvrirLogin(BLOQUE.telephone)

const messages: string[] = []
for (let i = 1; i <= 5; i++) {
  await essayer('11111')
  const texte = await corps()
  const dit = texte.match(/Mot de passe incorrect[^|\n]*/)?.[0]?.trim() ?? ''
  if (dit) messages.push(dit)
  if (i === 1) ok(dit.includes('Encore 4'), `le premier echec dit combien il reste (« ${dit} »)`)
  if (i === 4) ok(dit.includes('Encore 1'), `le quatrieme echec annonce le dernier essai (« ${dit} »)`)
}

ok((await corps()).includes('Compte bloqué'), 'le cinquieme essai bloque le compte')
ok(messages.length === 4, `les quatre premiers echecs disent le nombre d essais restants (${messages.length})`)

const apresBlocage = await etat(BLOQUE.id)
ok(apresBlocage?.bloque === true, 'le blocage est enregistre en base, pas seulement a l ecran')

console.log('\n2. Un compte bloque refuse le BON mot de passe')
await essayer(BLOQUE.code)
ok((await corps()).includes('Compte bloqué'), 'meme le bon mot de passe est refuse pendant le blocage')

/* On revient a l'etape du login : le numero doit etre vide, sinon
   on ne peut plus taper celui de quelqu'un d'autre. */
await page.getByRole('button', { name: 'Retour' }).click()
await page.waitForTimeout(500)
const affiche = (await page.locator('.numero-affiche').innerText()).replace(/\s/g, '')
ok(!/\d/.test(affiche), 'le retour vide le login : on peut saisir quelqu un d autre')

console.log('\n3. La directrice debloque, depuis les reglages')
await ouvrirLogin(DIRECTRICE.telephone)
await essayer(DIRECTRICE.code)
await page.waitForTimeout(900)
ok((await page.locator('.ecran--connexion').count()) === 0, 'la directrice entre')

await reglages()
ok((await corps()).includes('Bloqué'), 'la liste des personnes montre qui est bloque')
const ligne = page.locator(`[data-personne="${BLOQUE.id}"]`)
ok((await ligne.getByRole('button', { name: 'Débloquer' }).count()) === 1, 'un bouton « Débloquer » apparait pour cette personne')
await ligne.getByRole('button', { name: 'Débloquer' }).click()
await page.waitForTimeout(900)
ok((await corps()).includes('Compte débloqué'), 'le message confirme le deblocage')

const apresDeblocage = await etat(BLOQUE.id)
ok(apresDeblocage?.bloque === false, 'le blocage est leve en base')
ok(apresDeblocage?.tentatives === 0, 'le compteur est remis a zero')

console.log('\n4. La personne bloquee rentre avec son mot de passe')
await sortir()
await ouvrirLogin(BLOQUE.telephone)
await essayer(BLOQUE.code)
await page.waitForTimeout(900)
ok((await page.locator('.ecran--connexion').count()) === 0, 'Ibrahim entre avec son mot de passe, sans le changer')

console.log('\n5. Remettre 00000')
await sortir()
await ouvrirLogin(DIRECTRICE.telephone)
await essayer(DIRECTRICE.code)
await page.waitForTimeout(900)
await reglages()
await page.locator(`[data-personne="${BLOQUE.id}"]`).getByRole('button', { name: /Remettre 00000/ }).click()
await page.waitForTimeout(900)
ok((await corps()).includes('Mot de passe remis'), 'le message annonce le mot de passe provisoire')

await sortir()
await ouvrirLogin(BLOQUE.telephone)
await essayer('54321')
ok((await corps()).includes('Mot de passe incorrect'), 'l ancien mot de passe ne marche plus')

await reviserLogin()
await ouvrirLogin(BLOQUE.telephone)
await essayer('00000')
await page.waitForTimeout(900)
ok((await page.locator('.ecran--connexion').count()) === 0, 'le mot de passe provisoire 00000 ouvre')

console.log(echecs === 0 ? '\nLE BLOCAGE ET LE DEBLOCAGE MARCHENT.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()
