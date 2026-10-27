import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LA CONNEXION, DANS UN VRAI NAVIGATEUR

   Les tests unitaires prouvent que la comparaison du code est
   juste. Ils ne prouvent pas qu'un doigt peut se connecter sur un
   ecran reel.

   Ce script fait exactement ce que fait un humain : il appuie sur
   les touches du pave. D'abord dix chiffres pour le login, puis
   cinq pour le mot de passe.

   Il teste aussi ce qui a change et qu'aucun test unitaire ne
   voit : un login inconnu dit « Login inconnu » et non « Mot de
   passe incorrect ». La personne ne doit pas chercher son mot de
   passe pendant qu'elle s'est trompee de login.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })

const erreurs: string[] = []
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => erreurs.push((e.stack ?? e.message).slice(0, 900)))

const echoues: string[] = []
const ok = (bon: boolean, message: string) => {
  if (!bon) echoues.push(message)
  console.log(`  ${bon ? 'OK   ' : 'ECHEC'} ${message}`)
}
const titre = (t: string) => console.log(`\n${t}`)
const attendre = (ms: number) => page.waitForTimeout(ms)

const NUMERO = '9000000001'
const CODE = '12345'

async function taper(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await attendre(60)
  }
}

/** Repart d'un ecran de connexion vierge.

    Effacer chiffre par chiffre est fragile : si le pave refuse un
    effacer de trop, le reste du script teste autre chose. On
    recharge, ce qui remet le pave a zero — exactement comme le
    fait une personne qui ferme et rouvre l'application. */
async function ecranVierge() {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await prepare(page)
  await attendre(1000)
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

/* On attend que le pave soit pret : l'application demarre. */
await prepare(page)
await attendre(1200)

/* On prepare la porte avant de la tester : un compte avec un
   numero connu et un code connu. Sans cela, le script devrait
   charger le jeu d'essai, ce qui exige deja d'etre connecte —
   donc de passer par la porte qu'on veut justement tester. */
await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  const { empreinte, LONGUEUR_CODE } = await import('/src/domaine/acces.ts')
  const id = 'u-test'
  await base.utilisateurs.put({
    id,
    nom: 'Personne de test',
    role: 'responsable',
    rayonsAutorises: ['r-med', 'r-men'],
    actif: true,
    independant: true,
    telephone: '9000000001',
    longueurCode: LONGUEUR_CODE,
    empreinte: empreinte(id, '12345'),
  })
})
await page.reload({ waitUntil: 'networkidle' })
await prepare(page)
await attendre(1000)

/* ---------- 1. L ecran du login ---------- */
titre('1. Ton login')
const pave = page.locator('.pave__touche')
ok((await pave.count()) === 11, `le pave est affiche (${await pave.count()} touches)`)

const chiffres = await page.locator('.numero-affiche__chiffre').count()
ok(chiffres === 10, `il y a de la place pour dix chiffres (${chiffres} cases)`)

const entrer = page.getByRole('button', { name: 'Entrer' })
ok(await entrer.isDisabled(), '« Entrer » est inactif tant que le numero est incomplet')

/* Un numero incomplet n entre pas. */
await taper(NUMERO.slice(0, 8))
ok(await entrer.isDisabled(), 'huit chiffres ne suffisent pas : on refuse avant d enregistrer')
await page.screenshot({ path: 'captures/connexion-numero.png' })

/* ---------- 2. Un numero inconnu ---------- */
titre('2. Un login qui n existe pas')
await ecranVierge()
await taper('9012345678')
ok(!(await entrer.isDisabled()), '« Entrer » s active a dix chiffres')
await entrer.click()
await attendre(700)

const messageInconnu = (await page.locator('.connexion__erreur').first().innerText().catch(() => '')).trim()
ok(messageInconnu === 'Login inconnu.', `un login inconnu dit « Login inconnu » (« ${messageInconnu} »), pas « mot de passe incorrect »`)
await page.screenshot({ path: 'captures/connexion-inconnu.png' })

/* ---------- 3. Le bon numero ---------- */
titre('3. Ton login, puis ton mot de passe')
await ecranVierge()
await taper(NUMERO)
await entrer.click()
await attendre(900)

const titreCode = await page.locator('.connexion__titre').innerText().catch(() => '')
ok(titreCode.includes('Mot de passe'), `l ecran passe a l etape du mot de passe (« ${titreCode} »)`)

const nomAffiche = await page.locator('.connexion__indices').innerText().catch(() => '')
ok(nomAffiche.trim().length > 0, `le nom de la personne est affiche (« ${nomAffiche.trim()} »)`)

/* ---------- 4. Un code faux ---------- */
titre('4. Un code faux')
ok(await entrer.isDisabled(), '« Entrer » inactif tant que le code est incomplet')
await taper('99999')
ok(!(await entrer.isDisabled()), '« Entrer » s active a cinq chiffres')
await entrer.click()
await attendre(700)
ok((await page.locator('.connexion__erreur').count()) > 0, 'un code faux affiche un message')
await page.screenshot({ path: 'captures/connexion-code-faux.png' })

/* ---------- 5. Le bon code ---------- */
titre('5. Le bon code')
await taper(CODE)
await entrer.click()
await attendre(1200)
ok((await page.locator('.ecran--connexion').count()) === 0, 'le bon numero et le bon code laissent entrer')
ok((await page.locator('.accueil').count()) > 0, 'l accueil est affiche')
await page.screenshot({ path: 'captures/connexion-ok.png' })

/* ---------- 6. La porte de secours ---------- */
titre('6. J ai oublie mon login')
await page.locator('.qui-btn').click()
await attendre(1200)
const secours = page.getByRole('button', { name: /oublié mon login/ })
ok((await secours.count()) > 0, 'le bouton de secours est la')
await secours.click()
await attendre(700)
const personnes = await page.locator('.personne').count()
ok(personnes > 0, `la liste des noms est accessible (${personnes} personne(s))`)
await page.screenshot({ path: 'captures/connexion-secours.png' })

if (erreurs.length > 0) {
  console.log('\nERREURS CONSOLE :')
  for (const e of erreurs) console.log('  ' + e)
}

console.log(echoues.length === 0 ? '\nLA CONNEXION FONCTIONNE.' : `\n${echoues.length} ECHEC(S).`)
await navigateur.close()
process.exit(echoues.length === 0 ? 0 : 1)