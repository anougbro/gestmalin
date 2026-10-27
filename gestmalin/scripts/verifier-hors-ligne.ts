import { chromium } from 'playwright'
import { connecterParNom, creerCompte, prepare } from './aide.ts'

/* ============================================================
   LA VERSION PUBLIEE, HORS LIGNE

   Ce test ne regarde pas le serveur de developpement : il sert
   le `dist` construit avec le meme chemin de base que GitHub
   Pages, puis coupe le reseau.

   C'est le seul test qui dit vrai sur l'installation sur un
   telephone. Une PWA peut fonctionner parfaitement en ligne et
   demarrer sur une page blanche en hors ligne — le service
   worker enregistre, mais le cache ne contient pas le premier
   ecran. */

const base = process.env.BASE_PATH ?? '/gestmalin/'
const url = `http://localhost:4173${base}`

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })
let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK  ' : 'ECHEC'} ${message}`)
}

console.log(`Test de la version construite, servie sous ${base}`)
console.log(`  ${url}`)

const erreurs: string[] = []
page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 140)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 140)) })

/* ---------- En ligne, d'abord ---------- */
await page.goto(url, { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1500)
ok((await page.locator('.ecran--connexion').count()) > 0, 'la page se charge depuis le chemin de base')

/* Le service worker doit s installer : sans lui, aucune
   installation sur telephone, et pas de hors ligne. */
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'absent du navigateur'
  const r = await navigator.serviceWorker.getRegistration()
  return r ? 'inscrit' : 'AUCUN'
})
ok(sw === 'inscrit', `le service worker est inscrit (${sw})`)

const manifest = await page.evaluate(async () => {
  const l = document.querySelector('link[rel=manifest]') as HTMLLinkElement | null
  if (!l) return null
  const r = await fetch(l.href)
  return r.ok ? await r.json() : null
})
ok(!!manifest, 'le manifeste se charge')
ok(manifest?.start_url === base, `start_url correct (${manifest?.start_url})`)
ok(manifest?.id === base, `identite stable de l application (${manifest?.id})`)

/* On laisse le service worker remplir son cache. */
await page.waitForTimeout(2500)
const precache = await page.evaluate(async () => {
  const noms = await caches.keys()
  let total = 0
  for (const n of noms) total += (await (await caches.open(n)).keys()).length
  return { noms, total }
})
ok(precache.total > 5, `${precache.total} fichiers en cache, dans ${precache.noms.length} cache(s)`)

/* ---------- On installe le premier compte, comme la directrice ---------- */
await creerCompte(page, { nom: 'Amina', numero: '9000000001', code: '12345' })
ok((await page.locator('.ecran--connexion').count()) === 0, 'le premier compte ouvre directement la session')

/* La carte d'installation doit etre servie par le build : sans
   elle, personne ne sait que l'application peut vivre sur l'ecran
   d'accueil. */
await page.getByRole('button', { name: 'Réglages' }).first().click()
await page.waitForTimeout(800)
const carteInstallation = page.locator('[data-installation]')
ok((await carteInstallation.count()) === 1, 'la carte Installer est dans les reglages')
const etatInstallation = await carteInstallation.getAttribute('data-installation')
ok(
  ['proposee', 'manuelle', 'installee'].includes(etatInstallation ?? ''),
  `la carte dit dans quel etat est l installation (${etatInstallation})`,
)
await page.locator('.entete__retour').click()
await page.waitForTimeout(700)

/* Et on ressort : la suite verifie que la porte fonctionne hors
   ligne, il faut donc etre revenu devant. */
await page.locator('.qui-btn-lg').click()
await page.waitForTimeout(800)
ok((await page.locator('.ecran--connexion').count()) === 1, 'on revient a l ecran de connexion')

/* ---------- On simule une connexion complete, puis on coupe ---------- */
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const ecranVide = await page.locator('#root').innerHTML().catch(() => '')
ok(ecranVide.trim().length > 0, 'le code demarre SANS reseau')
ok((await page.locator('.ecran--connexion').count()) > 0, 'l ecran de connexion est la, hors ligne')

/* Et on peut se connecter hors ligne, base comprise. On passe par
   la liste des noms : c'est une vraie porte, et elle n'a besoin
   d'aucun reseau — c'est ce que ce test verifie. La porte du
   numero, elle, est verifiee par `verifier-connexion`. */
await connecterParNom(page, 'Amina', '12345')
ok((await page.locator('.ecran--connexion').count()) === 0, 'on se connecte hors ligne')

/* Et les donnees restent la apres rechargement hors ligne. */
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
ok((await page.locator('.ecran--connexion').count()) === 0, 'la session survit a un rechargement hors ligne')

/* ---------- L'icone est bien la, sinon rien ne s'installe ---------- */
const icone = await page.evaluate(async (b) => {
  const r = await fetch(`${b}icone-192.png`)
  return r.ok ? r.status : 0
}, base)
ok(icone === 200, `l icone est servie au bon endroit (HTTP ${icone})`)

await page.context().setOffline(false)

if (erreurs.length) {
  console.log('\n  erreurs console :')
  for (const e of [...new Set(erreurs)]) console.log('    ' + e)
}

console.log(echecs === 0 ? '\nLA VERSION PUBLIEE MARCHE HORS LIGNE.' : `\n${echecs} ECHEC(S).`)
await navigateur.close()