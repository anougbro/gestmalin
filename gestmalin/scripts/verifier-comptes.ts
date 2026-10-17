import { chromium } from 'playwright'

/* ============================================================
   LES TROIS COMPTES, VERIFIES PAR LEUR EMPREINTE

   On ne se contente pas de lire le code dans le source : on
   calcule l'empreinte de chaque code candidat et on la compare
   a celle qui est reellement stockee. Si le code du source ne
   correspond pas a la base, ce test le dit.
   ============================================================ */

const CANDIDATS = ['1234', '0000', '1111', '2222', '3333', '4321', '9999']

async function lire(page: import('playwright').Page) {
  return page.evaluate(async (candidats: string[]) => {
    const req = indexedDB.open('gestmalin')
    const db = await new Promise<IDBDatabase>((ok, ko) => {
      req.onsuccess = () => ok(req.result)
      req.onerror = () => ko(req.error)
    })
    const tx = db.transaction('utilisateurs', 'readonly')
    const tous = await new Promise<Record<string, unknown>[]>((ok) => {
      const r = tx.objectStore('utilisateurs').getAll()
      r.onsuccess = () => ok(r.result)
    })

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

    return tous.map((u) => ({
      nom: u.nom as string,
      role: u.role as string,
      code: candidats.find((c) => empreinte(String(u.id), c) === String(u.empreinte)) ?? 'INTROUVABLE',
    }))
  }, CANDIDATS)
}

/* En largeur bureau : la barre laterale montre « Reglages ».
   Sur telephone, c'est une tuile de l'accueil. */
const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

console.log('=== AVANT DE CHARGER LE JEU D ESSAI ===')
for (const p of await lire(page)) console.log(`  ${p.nom.padEnd(12)} ${p.role.padEnd(14)} code ${p.code}`)

/* ---- On se connecte, puis on charge le jeu d'essai ---- */
for (const c of ['1', '2', '3', '4']) {
  await page.getByRole('button', { name: c, exact: true }).click()
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await page.waitForTimeout(1500)

console.log('\n=== APRES ===')
const comptes = await lire(page)
for (const p of comptes) console.log(`  ${p.nom.padEnd(12)} ${p.role.padEnd(14)} code ${p.code}`)

/* ---- On verifie que chaque code ouvre la porte ---- */
console.log('\n=== CHAQUE CODE OUVRE-T-IL LA PORTE ? ===')
let echecs = 0
for (const p of comptes) {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  /* Plusieurs personnes : il faut d'abord choisir qui on est. */
  const personne = page.locator('.personne', { hasText: p.nom }).first()
  if (await personne.count()) {
    await personne.click()
    await page.waitForTimeout(250)
  }

  for (const c of p.code) {
    await page.getByRole('button', { name: c, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(800)

  const dedans = (await page.locator('.ecran--connexion').count()) === 0
  console.log(`  ${p.nom.padEnd(12)} code ${p.code}  ${dedans ? 'OK' : 'REFUSE'}`)
  if (!dedans) echecs++
}

console.log(echecs === 0 ? '\nTOUS LES CODES MARCHENT.' : `\n${echecs} CODE(S) REFUSE(S).`)
await navigateur.close()