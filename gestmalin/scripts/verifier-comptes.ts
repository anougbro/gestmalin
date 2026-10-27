import { chromium } from 'playwright'
import { connecterParNom, prepare } from './aide.ts'

/* ============================================================
   LES COMPTES, PAS A PAS

   On reproduit exactement le parcours d'une personne :
   installation, jeu d'essai, changement de personne, puis
   creation de son propre compte.

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

async function comptes() {
  return page.evaluate(async () => {
    const req = indexedDB.open('gestmalin')
    const db = await new Promise<IDBDatabase>((r, k) => { req.onsuccess = () => r(req.result); req.onerror = () => k(req.error) })
    const tx = db.transaction('utilisateurs', 'readonly')
    const tous = await new Promise<Record<string, unknown>[]>((r) => { const q = tx.objectStore('utilisateurs').getAll(); q.onsuccess = () => r(q.result) })
    return tous.map((u) => ({
      nom: u.nom as string,
      role: u.role as string,
      actif: u.actif as boolean,
      telephone: (u.telephone as string | undefined) ?? null,
      rayons: u.rayonsAutorises as string[],
      empreinte: String(u.empreinte),
    }))
  })
}

const debut = await comptes()

console.log('1. Au premier demarrage')
console.log(`   ${debut.length} compte(s) : ${debut.map((u) => u.nom).join(', ') || '(aucun)'}`)
ok(debut.length === 0, 'la base est vide : aucun compte prepare, aucune porte ouverte')

/* ---------- Le pave, pour les saisies qui suivent ---------- */

async function taperPave(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
}

async function entrerParNumero(numero: string, code: string) {
  await taperPave(numero)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)
  await taperPave(code)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

async function sortir() {
  await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
  await page.waitForTimeout(900)
}

const compteNomme = (nom: string) => page.evaluate(async (n: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const u = (await base.utilisateurs.toArray()).find((x) => x.nom === n)
  return u ? {
    id: u.id,
    role: u.role,
    telephone: u.telephone ?? null,
    rayons: u.rayonsAutorises,
    empreinte: u.empreinte,
  } : null
}, nom)

/* ============================================================
   2. LE PREMIER COMPTE EST DIRECTEUR

   Sans compte prepare, quelqu'un doit creer le sien. C'est la
   premiere personne qui se presente qui commande : elle seule
   pourra debloquer les autres et transferer un rayon. */
console.log('\n2. Le premier compte, cree par la premiere personne')

await page.getByRole('button', { name: 'Créer mon compte' }).click()
await page.waitForTimeout(700)
await page.locator('input.champ__saisie').first().fill('Directrice')
await page.getByRole('button', { name: 'Suivant', exact: true }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Médicaments' }).click()
await page.waitForTimeout(500)
await taperPave('9000000009')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(700)
await taperPave('12345')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(700)
await taperPave('12345')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(700)

ok(
  (await page.getByText('Ton courriel', { exact: true }).count()) > 0,
  'le courriel est demande a la fin, apres le mot de passe',
)
await page.getByRole('button', { name: 'Passer', exact: true }).click()
await page.waitForTimeout(1600)

ok(
  (await page.locator('.ecran--connexion').count()) === 0,
  'le compte neuf ouvre directement : on ne retape pas ce qu on vient de choisir',
)

const directrice = await compteNomme('Directrice')
ok(!!directrice, 'le compte existe vraiment en base')
ok(directrice?.role === 'directeur', `le premier compte est directeur (${directrice?.role})`)
ok(directrice?.telephone === '9000000009', `son numéro est enregistre (${directrice?.telephone})`)
ok(directrice?.empreinte === empreinte(directrice.id, '12345'), 'le mot de passe est stocke en empreinte, pas en clair')

/* ============================================================
   3. LE JEU D'ESSAI
   ============================================================ */
console.log('\n3. Le jeu d essai')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await page.waitForTimeout(2200)

const apres = await comptes()
console.log('   apres le chargement :')
for (const u of apres) console.log(`     ${u.nom.padEnd(12)} ${u.role.padEnd(12)} actif=${u.actif}`)
ok(apres.length === 4, `la directrice reste, les trois comptes d essai arrivent (${apres.length})`)

/* On verifie que l'empreinte stockee correspond bien au code
   annonce, en rejouant l'algorithme hors de l'application. */
const empreinteReelle = empreinte('u-2', '22222')
const amina = apres.find((u) => u.nom === 'Amina')
console.log(`   Amina : empreinte stockee ${amina?.empreinte}, empreinte de 22222 = ${empreinteReelle}`)
ok(amina?.empreinte === empreinteReelle, 'le code annonce est bien celui qui est enregistre')

/* ---------- Chaque code ouvre la porte ? ---------- */
console.log('\n4. Chaque code ouvre la porte ?')
for (const [nom, code] of [['Préparateur', '12345'], ['Amina', '22222'], ['Dr Souley', '33333']] as const) {
  await sortir()
  ok((await page.locator('.ecran--connexion').count()) === 1, `deconnexion depuis ${nom}`)
  await connecterParNom(page, nom, code)
  ok((await page.locator('.ecran--connexion').count()) === 0, `le code ${code} ouvre la porte de ${nom}`)
}

/* ============================================================
   5. CREER SON COMPTE, QUAND ON EST LA

   C'est la demande : chacun cree le sien quand il est present.
   Personne n'attend personne. On suit donc les cinq questions
   comme le ferait la personne des menagers, et on regarde ce qui
   s'ecrit vraiment en base. */
console.log('\n5. Créer son compte, quand on est là')

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
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Passer', exact: true }).click()
await page.waitForTimeout(1600)

const creee = await compteNomme('Amina Test')
ok(!!creee, 'le compte existe apres les cinq questions')
ok(creee?.role === 'preparateur', `le deuxieme compte est preparateur (${creee?.role})`)
ok(creee?.telephone === '9000000007', `le numero est enregistre (${creee?.telephone})`)
ok(JSON.stringify(creee?.rayons) === '["r-men"]', `le compte ne tient que son rayon (${JSON.stringify(creee?.rayons)})`)
ok(creee?.empreinte === empreinte(creee!.id, '44444'), 'le code est stocke en empreinte, pas en clair')

/* ============================================================
   6. CHANGER SON NUMERO, QUAND ON VEUT

   Le numero est l'identite : il doit pouvoir changer sans perdre
   son compte, son rayon, ni son code. Et il ne doit pas pouvoir
   prendre celui d'un autre — c'est la seule regle qui empeche un
   code d'ouvrir la mauvaise personne. */
console.log('\n6. Changer son numéro, quand on veut')

await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(900)
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
ok(texteAncien.includes('Numéro inconnu'), "l'ancien numéro n ouvre plus : il est vraiment remplace")

console.log(echecs === 0 ? '\nLES COMPTES MARCHENT, DE L INSTALLATION AU CHANGEMENT DE NUMERO.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()
