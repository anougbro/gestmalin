import { chromium } from 'playwright'

/* ============================================================
   QUELS CODES, EXACTEMENT, SELON L'ETAT DE LA BASE

   La reponse n'est pas la meme avant et apres le chargement du
   jeu d'essai. C'est precisement pour ca que la question se
   repose : il n'y a aucun endroit dans l'application ou lire la
   reponse. */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

/* L'algorithme d'empreinte, reecrit ici : on veut retrouver quel
   code donne quelle empreinte, l'application ne stocke jamais le
   code en clair. */
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

const CANDIDATS = ['12345', '22222', '33333', '00000', '11111', '1234', '2222', '3333']

async function lireComptes() {
  return page.evaluate(async (cands: string[]) => {
    const req = indexedDB.open('gestmalin')
    const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
    const tx = db.transaction('utilisateurs', 'readonly')
    const tous = await new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
    return tous.map((u) => ({ id: String(u.id), nom: String(u.nom), role: String(u.role), empreinte: String(u.empreinte) })).map((u) => ({ ...u, brut: cands }))
  }, CANDIDATS)
}

function retrouver(comptes: { id: string; nom: string; role: string; empreinte: string }[]) {
  return comptes.map((u) => ({
    nom: u.nom,
    role: u.role,
    code: CANDIDATS.find((c) => empreinte(u.id, c) === u.empreinte) ?? '???',
  }))
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

console.log('=== ETAT 1 : premier demarrage, ou base ancienne reparee ===')
const a = await lireComptes()
for (const c of retrouver(a)) console.log(`  ${c.nom.padEnd(12)} ${c.role.padEnd(14)} code ${c.code}`)

/* On charge le jeu d'essai. */
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

if ((await page.locator('.ecran--connexion').count()) === 0) {
  await page.getByRole('button', { name: 'Réglages' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /Charger le jeu/ }).click()
  await page.waitForTimeout(2000)

  console.log('\n=== ETAT 2 : apres « Charger le jeu d essai » ===')
  const b = await lireComptes()
  for (const c of retrouver(b)) console.log(`  ${c.nom.padEnd(12)} ${c.role.padEnd(14)} code ${c.code}`)
} else {
  console.log('\n(connexion impossible, etat 2 non teste)')
}

await navigateur.close()