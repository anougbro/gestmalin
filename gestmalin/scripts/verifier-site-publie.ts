import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LE SITE PUBLIÉ, VRAIMENT EN LIGNE

   Tous les autres tests tournent sur localhost : la machine du
   developpeur, ou le fichier existe donc toujours. Ici on
   interroge l'adresse publique, puis on coupe le reseau.

   C'est le seul test qui reproduise ce que verra le telephone
   de la pharmacie. */
const url = process.argv[2] ?? 'https://anougbro.github.io/gestmalin/'

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

console.log(`Test du site publie : ${url}\n`)

const erreurs: string[] = []
page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 130)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 130)) })

/* ---------- En ligne ---------- */
await page.goto(url, { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(2000)
ok((await page.locator('.ecran--connexion').count()) > 0, 'la page se charge depuis Internet')

const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'absent'
  const r = await navigator.serviceWorker.getRegistration()
  return r ? 'inscrit' : 'AUCUN'
})
ok(sw === 'inscrit', `le service worker est inscrit (${sw})`)

const manifeste = await page.evaluate(async () => {
  const l = document.querySelector('link[rel=manifest]') as HTMLLinkElement
  const r = await fetch(l.href)
  return r.ok ? await r.json() : null
})
ok(!!manifeste, 'le manifeste se charge')
ok(manifeste?.display === 'standalone', `mode application (${manifeste?.display})`)
ok(!!manifeste?.icons?.some((i: { sizes: string }) => i.sizes === '512x512'), 'les icones sont declarees')

/* Le raccourci doit pointer dans le sous-dossier. */
const urlCourte = manifeste?.shortcuts?.[0]?.url ?? ''
ok(urlCourte.startsWith('/gestmalin/'), `raccourci bien relatif au sous-dossier (${urlCourte})`)

/* On attend le remplissage du cache. */
await page.waitForTimeout(3000)
const cache = await page.evaluate(async () => {
  const noms = await caches.keys()
  let n = 0
  for (const c of noms) n += (await (await caches.open(c)).keys()).length
  return n
})
ok(cache > 5, `${cache} fichiers en cache — l'application demarrera hors ligne`)

/* ---------- On coupe le reseau ---------- */
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

ok((await page.locator('.ecran--connexion').count()) > 0, 'elle demarre SANS reseau')

for (const c of '12345') {
  await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
  await page.waitForTimeout(60)
}
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1200)
ok((await page.locator('.ecran--connexion').count()) === 0, 'on se connecte hors ligne')

/* Le jeu d'essai complet, hors ligne : c'est le geste de travail. */
await page.locator('.menu-btn').click()
await page.waitForTimeout(700)
/* Deux listes de navigation coexistent dans la page : la barre
   laterale, masquee sur telephone, et celle du tiroir. Il faut
   viser celle du tiroir — sinon le clic porte sur l'autre. */
await page.locator('.tiroir .nav-item', { hasText: /^Réglages$/ }).click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await page.waitForTimeout(2500)

await page.locator('.entete__retour').click()
await page.waitForTimeout(900)
const auQuai = await page.locator('.stat').nth(2).innerText()
ok(/46/.test(auQuai), `les donnees se chargent hors ligne (au quai : ${auQuai.replace(/\s+/g, ' ').trim()})`)

await page.screenshot({ path: 'captures/site-publie-hors-ligne.png', fullPage: true })

await page.context().setOffline(false)

if (erreurs.length) {
  console.log('\n  erreurs console :')
  for (const e of [...new Set(erreurs)].slice(0, 5)) console.log('    ' + e)
}

console.log(echecs === 0 ? '\nLE SITE PUBLIE FONCTIONNE, HORS LIGNE COMME EN LIGNE.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()