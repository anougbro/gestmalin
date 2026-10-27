import { chromium } from 'playwright'
import { connecterParNom, prepare } from './aide.ts'

/* ============================================================
   LE PASSAGE A 5 CHIFFRES

   Ce qui compte n'est pas que 5 chiffres rentrent : c'est que
   l'ANCIENNE base — celle de la personne qui teste — soit
   reparee toute seule, sans intervention.

   On fabrique donc une base exactement comme elle etait avant
   (des comptes a 4 chiffres, calcules avec l'algorithme
   d'avant), on recharge l'application, et on verifie que la
   personne peut entrer. */
const navigateur = await chromium.launch()
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

/* L'algorithme d'empreinte, reecrit ici : on veut fabriquer une
   base « d'avant », pas reutiliser le code actuel. */
function empreinte4(id: string, code: string): string {
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

/* ---------- On fabrique la base d'avant ---------- */
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1400)

const ANCIENS = [
  { id: 'u-1', nom: 'Préparateur', role: 'preparateur', rayonsAutorises: ['r-med', 'r-men'], actif: true, longueurCode: 4, empreinte: empreinte4('u-1', '1234') },
  { id: 'u-2', nom: 'Amina', role: 'responsable', rayonsAutorises: ['r-men'], actif: true, longueurCode: 4, empreinte: empreinte4('u-2', '1111') },
  { id: 'u-3', nom: 'Dr Souley', role: 'pharmacien', rayonsAutorises: ['r-med', 'r-men'], actif: true, longueurCode: 4, empreinte: empreinte4('u-3', '2222') },
]

const plante = await page.evaluate(async (lignes: Record<string, unknown>[]) => {
  const nom = 'gestmalin'
  const req = indexedDB.open(nom)
  const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })

  /* On attend que les tables existent. */
  const attendre = (etat: DB | null) =>
    new Promise<IDBDatabase>((r) => { if (etat && [...etat.objectStoreNames].includes('utilisateurs')) r(etat) })
  const d = await attendre(db)

  await new Promise<void>((r) => {
    const tx = d.transaction('utilisateurs', 'readwrite')
    tx.objectStore('utilisateurs').clear()
    tx.oncomplete = () => r()
  })

  await new Promise<void>((r) => {
    const tx = d.transaction('utilisateurs', 'readwrite')
    const s = tx.objectStore('utilisateurs')
    for (const l of lignes) s.put(l)
    tx.oncomplete = () => r()
  })

  return lignes.length
}, ANCIENS)

console.log(`1. Base fabriquee comme avant le changement (${plante} comptes a 4 chiffres)`)

/* ---------- On recharge : la migration doit jouer ---------- */
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const apres = await page.evaluate(async () => {
  const req = indexedDB.open('gestmalin')
  const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
  const tx = db.transaction('utilisateurs', 'readonly')
  return new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
})

console.log('   apres rechargement :')
for (const u of apres) console.log(`     ${String(u.nom).padEnd(12)} longueurCode = ${u.longueurCode}`)

ok(apres.every((u) => u.longueurCode === 5), 'la migration a remis chaque compte a 5 chiffres')

/* ---------- Et on entre ---------- */
async function entrer(nom: string, code: string) {
  /* La porte de secours — la liste des noms — puis le code. C est
     le chemin qu'utilise une personne dont le numero est perdu,
     et il ouvre exactement les memes comptes que l'autre porte. */
  await connecterParNom(page, nom, code)
  return (await page.locator('.ecran--connexion').count()) === 0
}

/* Un code trop court ne rend meme pas « Entrer » actif : le pave
   lui-meme refuse, on ne tente rien. Le refus par le noyau est
   verifie par les tests unitaires — ici on verifie l'ecran. */
async function quatreChiffresRefuses(nom: string) {
  await prepare(page)
  await page.getByRole('button', { name: /oublié mon login/ }).click()
  await page.waitForTimeout(500)
  await page.locator('.personne', { hasText: nom }).first().click()
  await page.waitForTimeout(500)
  for (const c of '1234') {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(50)
  }
  const refuse = !(await page.getByRole('button', { name: 'Entrer' }).isEnabled())

  /* On revient a un ecran de connexion neuf : l essai laisse la
     personne au milieu du pave du code, et la suite suppose un
     ecran vierge. Recharger fait exactement ce que ferait
     quelqu un qui ferme et rouvre l application. */
  await page.reload({ waitUntil: 'networkidle' })
  return refuse
}

console.log('\n2. Un code de 4 chiffres ne valide meme pas')
ok(await quatreChiffresRefuses('Préparateur'), 'quatre chiffres n activent pas « Entrer »')

console.log('\n3. Les nouveaux codes passent')
ok(await entrer('Préparateur', '00000'), 'Préparateur entre avec le code de secours 00000')

await page.locator('.qui:visible, .qui-btn:visible').first().click()
await page.waitForTimeout(700)
ok(await entrer('Amina', '00000'), 'Amina entre avec le code de secours')

await page.locator('.qui:visible, .qui-btn:visible').first().click()
await page.waitForTimeout(700)
ok(await entrer('Dr Souley', '00000'), 'Dr Souley entre avec le code de secours')

/* ---------- Et l'ecran montre bien cinq pastilles ---------- */
await page.locator('.qui:visible, .qui-btn:visible').first().click()
await page.waitForTimeout(800)

/* Le pave du numero precede le pave du code. On passe par la
   porte de secours pour choisir la personne, et on compte alors
   les pastilles du CODE. */
await prepare(page)
await page.getByRole('button', { name: /oublié mon login/ }).click()
await page.waitForTimeout(500)

if ((await page.locator('.personne').count()) > 0) {
  await page.locator('.personne').first().click()
  await page.waitForTimeout(400)
}

const pastilles = await page.locator('.pastilles .pastille-point').count()
ok(pastilles === 5, `le pave du code montre 5 pastilles (${pastilles})`)

console.log(echecs === 0 ? '\nLE PASSAGE A 5 CHIFFRES MARCHE.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()