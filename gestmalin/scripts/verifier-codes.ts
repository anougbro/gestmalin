import { chromium } from 'playwright'

/* ============================================================
   LES CODES SONT ECRITS DANS L'APPLICATION

   Tant qu'on ne sait pas quel code on a choisi, on le demande a
   quelqu'un d'autre — et l'application ne peut pas le dire, elle
   ne stocke qu'une empreinte.

   Cette verification manufacture le cas le plus desagréable : la
   base a ete reparee apres un changement de longueur, tout le
   monde est passe a 00000, et la liste annonce 22222. La liste
   ment. Il faut donc pouvoir la remettre a jour d'un bouton.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
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
  for (let i = 0; i < 'gestmalin'.length; i++) h3 = (Math.imul(h3, 31) + 'gestmalin'.charCodeAt(i)) >>> 0
  return [h1, h2, h3].map((n) => n.toString(36)).join('-')
}

const CANDIDATS = ['12345', '22222', '33333', '00000']

async function lire() {
  const brut = await page.evaluate(async () => {
    const req = indexedDB.open('gestmalin')
    const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
    const tx = db.transaction('utilisateurs', 'readonly')
    return new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
  })
  return brut.map((u) => ({
    id: String(u.id),
    nom: String(u.nom),
    code: CANDIDATS.find((c) => empreinte(String(u.id), c) === String(u.empreinte)) ?? '???',
  }))
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

/* ---------- On fabrique le cas desagréable ---------- */
await page.evaluate(async () => {
  const req = indexedDB.open('gestmalin')
  const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
  const tx = db.transaction('utilisateurs', 'readwrite')
  const s = tx.objectStore('utilisateurs')
  s.clear()
  s.put({ id: 'u-1', nom: 'Préparateur', role: 'preparateur', rayonsAutorises: ['r-med', 'r-men'], actif: true, longueurCode: 4, empreinte: 'vieille' })
  s.put({ id: 'u-2', nom: 'Amina', role: 'responsable', rayonsAutorises: ['r-men'], actif: true, longueurCode: 4, empreinte: 'vieille' })
  await new Promise<void>((r) => { tx.oncomplete = () => r() })
})

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

/* ---------- D'abord on entre ---------- */
if ((await page.locator('.personne').count()) > 0) {
  await page.locator('.personne').first().click()
  await page.waitForTimeout(300)
}
for (const c of '12345') {
  await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
  await page.waitForTimeout(50)
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1100)
ok((await page.locator('.ecran--connexion').count()) === 0, 'le code 12345 entre')

/* ---------- Ensuite on lit la liste, dans les reglages ---------- */
console.log('\n1. La liste des codes est ecrite dans l application')
await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(800)

const liste = await page.locator('.codes__ligne').count()
ok(liste === 3, `la liste affiche 3 personnes (${liste})`)

const noms = await page.locator('.codes__nom').allTextContents()
ok(noms.join(' | ') === 'Préparateur | Amina | Dr Souley', `les trois noms : ${noms.join(', ')}`)

const codes = (await page.locator('.codes__code').allTextContents()).map((s) => s.trim())
ok(codes.join(',') === '12345,22222,33333', `les codes annonces : ${codes.join(', ')}`)

const avant = await lire()
console.log('   etat reel : ' + avant.map((u) => `${u.nom}=${u.code}`).join(', '))
const avantFaux = avant.filter((u) => u.code !== codes[avant.indexOf(u)])
ok(avantFaux.length > 0, `la base ne correspond PAS encore a la liste (${avantFaux.map((u) => u.nom + '=' + u.code).join(', ')})`)

/* ---------- On remet ---------- */
console.log('\n2. On remet les codes de l essai')
const bouton = page.getByRole('button', { name: /Remettre les codes/ })
ok((await bouton.count()) === 1, 'le bouton existe')
await bouton.click()
await page.waitForTimeout(1200)
ok((await page.getByText(/codes de l'essai sont remis/).count()) > 0, 'un message confirme')

const apres = await lire()
console.log('   etat reel : ' + apres.map((u) => `${u.nom}=${u.code}`).join(', '))
const bonne = apres.find((u) => u.nom === 'Amina')?.code === '22222'
const bonne3 = apres.find((u) => u.nom === 'Dr Souley')?.code === '33333'
ok(bonne, 'Amina a bien le code annonce')
ok(bonne3, 'Dr Souley a bien le code annonce')

/* ---------- Et ils ouvrent vraiment la porte ---------- */
await page.getByRole('button', { name: /Changer/ }).last().click()
await page.waitForTimeout(800)
const amina = page.locator('.personne', { hasText: 'Amina' })
if ((await amina.count()) > 0) { await amina.first().click(); await page.waitForTimeout(300) }
for (const c of '22222') {
  await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
  await page.waitForTimeout(50)
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1100)
ok((await page.locator('.ecran--connexion').count()) === 0, 'Amina entre avec le code annonce')

console.log(echecs === 0 ? '\nLES CODES SONT LISIBLES ET VRAIS.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()