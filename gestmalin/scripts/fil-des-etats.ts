import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LE FIL DES ETATS, DANS L'ORDRE

   On rejoue tous les changements dans l'ordre ou ils sont
   arrives, et on demande a chaque etape quel code fonctionne.
   La reponse n'a pas toujours ete la meme — c'est exactement
   pour cela que la question revient. */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

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

const CANDIDATS = ['12345', '22222', '33333', '00000', '1234', '1111', '2222']

async function lire() {
  const brut = await page.evaluate(async () => {
    const req = indexedDB.open('gestmalin')
    const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
    const tx = db.transaction('utilisateurs', 'readonly')
    return new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
  })
  const tous = brut.map((u) => ({ id: String(u.id), nom: String(u.nom) }))
  for (const u of tous) {
    const e = brut.find((b) => String(b.id) === u.id)!.empreinte
    u.code = CANDIDATS.find((c) => empreinte(u.id, c) === String(e)) ?? '???'
  }
  return tous
}

async function afficher(titre: string) {
  const comptes = await lire()
  console.log(`\n${titre}`)
  for (const c of comptes) console.log(`   ${c.nom.padEnd(12)} code ${c.code}`)
}

/* ---------- Etape 1 : premier demarrage ---------- */
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1600)
await afficher('ETAPE 1 — premier demarrage')

/* ---------- Etape 2 : la personne charge le jeu d'essai ---------- */
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
await page.locator('.nav-item').last().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await page.waitForTimeout(2200)
await afficher('ETAPE 2 — apres « Charger le jeu d essai »')

/* ---------- Etape 3 : passage a 5 chiffres (migration) ---------- */
/* On remet les comptes a l'ancien format 4 chiffres, puis on
   recharge : c'est ce que la migration a encountering. */
await page.evaluate(() => {
  return new Promise<void>((r) => {
    const req = indexedDB.open('gestmalin')
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('utilisateurs', 'readwrite')
      const s = tx.objectStore('utilisateurs')
      s.getAll().onsuccess = (e) => {
        for (const u of (e.target.result as Record<string, unknown>[])) {
          u.longueurCode = 4
          s.put(u)
        }
      }
      tx.oncomplete = () => r()
    }
  })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
await afficher('ETAPE 3 — apres le passage a 5 chiffres (migration)')

/* ---------- Etape 4 : on remet les codes annonces ---------- */
console.log('\nETAPE 4 — apres « Remettre les mots de passe de l essai »')

/* Apres le rechargement, la session peut nous avoir deja
   connectes : on ne cherche pas un pave qui n'est pas la. */
if ((await page.locator('.ecran--connexion').count()) > 0) {
  if ((await page.locator('.personne').count()) > 0) {
    await page.locator('.personne').first().click()
    await page.waitForTimeout(300)
  }
  for (const c of '12345') {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(50)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1200)
}

if ((await page.locator('.ecran--connexion').count()) > 0) {
  console.log('   (toujours dehors apres la tentative : la restauration de session a echoue)')
  await navigateur.close()
  process.exit(1)
}

/* On va directement dans les reglages. L'accueil n'a pas de
   bandeau de titre, donc on ne cherche pas a savoir ou on est :
   on clique, puis on attend l'ecran. */
await page.locator('.nav-item', { hasText: /^Réglages$/ }).first().click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Remettre les mots de passe/ }).click()
await page.waitForTimeout(1500)
await afficher('   ')

/* ---------- Etape 5 : on essaie vraiment chaque couple ---------- */
console.log('\nETAPE 5 — tentative reelle')

async function essayer(nom: string, code: string) {
  await page.getByRole('button', { name: /Changer/ }).last().click()
  await page.waitForTimeout(800)
  const p = page.locator('.personne', { hasText: nom })
  if ((await p.count()) > 0) { await p.first().click(); await page.waitForTimeout(350) }

  /* On vide avant de retaper. */
  for (let i = 0; i < 8; i++) {
    const b = page.locator('.pave__touche--effacer')
    if ((await b.count()) === 0) break
    await b.click()
    await page.waitForTimeout(35)
  }

  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(50)
  }
  const actif = await page.getByRole('button', { name: 'Entrer' }).isEnabled()
  if (!actif) return `REFUSE (code trop court)`
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1100)
  return (await page.locator('.ecran--connexion').count()) === 0 ? 'ENTRE' : 'REFUSE'
}

for (const [nom, code] of [
  ['Préparateur', '12345'],
  ['Amina', '22222'],
  ['Dr Souley', '33333'],
  ['Amina', '00000'],
] as const) {
  const r = await essayer(nom, code)
  console.log(`   ${nom.padEnd(12)} avec ${code} : ${r}`)
}

await navigateur.close()