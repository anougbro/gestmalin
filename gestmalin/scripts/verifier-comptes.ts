import { chromium, type Page } from 'playwright'

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

async function taper(page: Page, code: string) {
  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1100)
}

await taper(page, '12345')
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
  await page.getByRole('button', { name: /Changer/ }).last().click()
  await page.waitForTimeout(800)
  ok((await page.locator('.ecran--connexion').count()) === 1, `deconnexion depuis ${nom}`)

  if ((await page.locator('.personne').count()) > 0) {
    const p = page.locator('.personne', { hasText: nom })
    if ((await p.count()) > 0) {
      await p.first().click()
      await page.waitForTimeout(350)
    }
  }
  await taper(page, code)
  ok((await page.locator('.ecran--connexion').count()) === 0, `le code ${code} ouvre la porte de ${nom}`)
}

console.log(echecs === 0 ? '\nLES TROIS COMPTES MARCHENT.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()