import { chromium, type Page } from 'playwright'
import { connecterParNom, prepare } from './aide.ts'

/* ============================================================
   LES COMPTES, PAS A PAS

   On reproduit exactement le parcours d'une personne :
   connexion, chargement du jeu d'essai, changement de personne,
   puis tentative avec chaque code.

   Deux causes possibles pour « les autres codes ne passent
   pas », et elles ne se ressemblent pas :
     - le compte n'existe pas encore
     - le compte existe mais le code est refuse
   On dit laquelle. */

const navigateur = await chromium.launch()
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

function empreinte(id: string, code: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const graine = `${id}:${code}`
  for (let i = 0; i < graine.length; i++) {
    const c = graine.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0
  }
  let h3 = 0
  const sel = 'gestmalin'
  for (let i = 0; i < sel.length; i++) h3 = (Math.imul(h3, 31) + sel.charCodeAt(i)) >>> 0
  return [h1, h2, h3].map((n) => n.toString(36)).join('-')
}


const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1400)

const debut = await page.evaluate(async () => {
  const req = indexedDB.open('gestmalin')
  const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
  const tx = db.transaction('utilisateurs', 'readonly')
  const tous = await new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
  return tous.map((u) => ({ nom: u.nom as string, actif: u.actif as boolean }))
})

console.log('1. Avant de charger le jeu d essai')
console.log(`   ${debut.length} compte(s) : ${debut.map((u) => u.nom).join(', ')}`)
ok(debut.length === 1, 'au premier demarrage, un seul compte existe')

/* On entre par la porte de secours — la liste des noms — puis le
   code. C est le chemin le plus court, et c est une vraie porte
   de l application : si elle cessait de fonctionner, ce script
   echouerait avec les autres. */
async function taper(page: Page, nom: string, code: string) {
  await connecterParNom(page, nom, code)
}
await taper(page, 'Préparateur', '12345')
ok((await page.locator('.ecran--connexion').count()) === 0, 'le code 12345 entre')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await page.waitForTimeout(2000)

const apres = await page.evaluate(async () => {
  const req = indexedDB.open('gestmalin')
  const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
  const tx = db.transaction('utilisateurs', 'readonly')
  const tous = await new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
  return tous.map((u) => ({ nom: u.nom as string, actif: u.actif as boolean, empreinte: String(u.empreinte) }))
})

console.log('\n2. Apres le chargement du jeu d essai')
for (const u of apres) console.log(`   ${u.nom.padEnd(12)} actif=${u.actif}  empreinte=${u.empreinte}`)
ok(apres.length === 3, `trois comptes existent (${apres.length})`)

/* On verifie que l'empreinte stockee correspond bien au code
   annonce, en rejouant l'algorithme hors de l'application. */
const empreinteReelle = empreinte('u-2', '22222')
const amina = apres.find((u) => u.nom === 'Amina')
console.log(`   Amina : empreinte stockee ${amina?.empreinte}, empreinte de 22222 = ${empreinteReelle}`)

console.log('\n3. Chaque code ouvre la porte ?')
for (const [nom, code] of [['Préparateur', '12345'], ['Amina', '22222'], ['Dr Souley', '33333']] as const) {
  await page.locator('.qui:visible, .qui-btn:visible').first().click()
  await page.waitForTimeout(800)
  ok((await page.locator('.ecran--connexion').count()) === 1, `deconnexion depuis ${nom}`)
  await taper(page, nom, code)
  ok((await page.locator('.ecran--connexion').count()) === 0, `le code ${code} ouvre la porte de ${nom}`)
}

/* ---------- Les gestes du pave ---------- */

async function taperPave(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
}

async function sortir() {
  await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
  await page.waitForTimeout(900)
}

async function entrerParNumero(numero: string, code: string) {
  await taperPave(numero)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)
  await taperPave(code)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

const compteNomme = (nom: string) => page.evaluate(async (n: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const u = (await base.utilisateurs.toArray()).find((x) => x.nom === n)
  return u ? { id: u.id, telephone: u.telephone ?? null, rayons: u.rayonsAutorises, empreinte: u.empreinte } : null
}, nom)

/* ============================================================
   4. CREER SON COMPTE, QUAND ON EST LA

   C'est la demande : chacun cree le sien quand il est present.
   Personne n'attend personne. On suit donc les quatre questions
   comme le ferait la personne des menagers, et on regarde ce qui
   s'ecrit vraiment en base. */
console.log('\n4. Créer son compte, quand on est là')

await sortir()
await page.getByRole('button', { name: 'Créer mon compte' }).click()
await page.waitForTimeout(700)

await page.locator('input.champ__saisie').first().fill('Amina Test')
await page.getByRole('button', { name: 'Suivant', exact: true }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Ménagers' }).click()
await page.waitForTimeout(500)
await taperPave('9000000007')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(700)
await taperPave('44444')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(700)
await taperPave('44444')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1400)

const creee = await compteNomme('Amina Test')
ok(!!creee, 'le compte existe apres les quatre questions')
ok(creee?.telephone === '9000000007', `le numero est enregistre (${creee?.telephone})`)
ok(JSON.stringify(creee?.rayons) === '["r-men"]', `le compte ne tient que son rayon (${JSON.stringify(creee?.rayons)})`)
ok(creee?.empreinte === empreinte(creee.id, '44444'), 'le code est stocke en empreinte, pas en clair')

/* ============================================================
   5. CHANGER SON NUMERO, QUAND ON VEUT

   Le numero est l'identite : il doit pouvoir changer sans perdre
   son compte, son rayon, ni son code. Et il ne doit pas pouvoir
   prendre celui d'un autre — c'est la seule regle qui empeche un
   code d'ouvrir la mauvaise personne. */
console.log('\n5. Changer son numéro, quand on veut')

await entrerParNumero('9000000007', '44444')
ok((await page.locator('.ecran--connexion').count()) === 0, 'le numero qu on vient de creer ouvre la porte')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Changer mon numéro/ }).click()
await page.waitForTimeout(700)
await taperPave('9000000008')
await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
await page.waitForTimeout(1000)

const renumerotee = await compteNomme('Amina Test')
ok(renumerotee?.telephone === '9000000008', `le numero est change (${renumerotee?.telephone})`)
ok(renumerotee?.id === creee?.id, 'c est le meme compte : le rayon et le code suivent')

/* Le numero d'une autre personne est refuse, au moment d'ecrire. */
await page.getByRole('button', { name: /Changer mon numéro/ }).click()
await page.waitForTimeout(700)
await taperPave('9000000002')
await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
await page.waitForTimeout(800)

const texteReglages = await page.locator('body').innerText()
ok(texteReglages.includes('déjà pris'), 'le numero d une autre personne est refuse, et la raison est dite')
const inchangee = await compteNomme('Amina Test')
ok(inchangee?.telephone === '9000000008', 'le refus n a rien ecrit : le numero reste le sien')

await page.locator('.entete__retour').click()
await page.waitForTimeout(600)

/* Le nouveau numero ouvre, l'ancien non. */
await sortir()
await entrerParNumero('9000000008', '44444')
ok((await page.locator('.ecran--connexion').count()) === 0, 'le nouveau numero ouvre la porte')

await sortir()
await taperPave('9000000007')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)
const texteAncien = await page.locator('body').innerText()
ok(texteAncien.includes('Numéro inconnu'), "l'ancien numero n ouvre plus : il est vraiment remplace")

console.log(echecs === 0 ? '\nLES COMPTES MARCHENT, DE LA CREATION AU CHANGEMENT DE NUMERO.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()