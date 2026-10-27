import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/* ============================================================
   UN SEUL TELEPHONE, DEUX PERSONNES, DEUX RAYONS

   Le modele a change, et le sens du mot « cloisonnement » avec lui.

   Avant : un telephone appartenait a un rayon. Celui de la
   pharmacie, ou celui des menagers. Deux telephones, deux bases,
   rien en commun — la separation tenait parce que les donnees
   n'etaient pas au meme endroit.

   Maintenant : un seul telephone sert les deux rayons, et les deux
   jeux de donnees vivent dans la MEME base. La separation ne peut
   donc plus venir du support. Elle vient du COMPTE : c'est le
   numero et le code qui ouvrent, et c'est `rayonsAutorises` qui
   decide de ce qu'on voit.

   Ce deplacement change la nature du risque. Avant, se tromper de
   rayon voulait dire ecrire dans une base qu'on ne reverrait
   jamais ; maintenant, cela veut dire ecrire dans le rayon du
   voisin, sur le meme telephone, a portee de main. La question
   n'est plus « quelle base ? » mais « quel compte est ouvert ? ».

   C'est une famille de defaut connue de ce projet : une regle
   ecrite, testee, et jamais raccordee. `rayonsAutorises` et
   `peutUtiliser` existaient deja quand rien ne les appelait. Ce
   script ne teste donc pas le modele — les tests unitaires le
   font. Il ouvre l'application et regarde ce qui se passe.
   ============================================================ */

mkdirSync('captures', { recursive: true })

const navigateur = await chromium.launch()

let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK   ' : 'ECHEC'} ${message}`)
}
const titre = (t: string) => console.log(`\n${t}`)

/* Un seul contexte : un seul telephone, une seule base. */
const contexte = await navigateur.newContext({ viewport: { width: 393, height: 852 } })
const page = await contexte.newPage()

const PHARMACIE = { numero: '9000000001', code: '11111', rayon: 'Médicaments', id: 'r-med' }
const MENAGE = { numero: '9000000002', code: '22222', rayon: 'Ménagers', id: 'r-men' }

/* ---------- Les deux comptes ----------

   Deux numeros differents, deux codes differents, deux rayons
   differents. C'est ce que la pharmacie fera le jour de
   l'installation : chacun cree le sien quand il est la. */
async function semerLesComptes() {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.evaluate(async (comptes: Array<{ id: string; nom: string; numero: string; code: string; rayon: string }>) => {
    const { base } = await import('/src/donnees/base.ts')
    const { empreinte, LONGUEUR_CODE } = await import('/src/domaine/acces.ts')
    for (const c of comptes) {
      await base.utilisateurs.put({
        id: c.id,
        nom: c.nom,
        role: 'responsable',
        rayonsAutorises: [c.rayon],
        actif: true,
        independant: true,
        telephone: c.numero,
        longueurCode: LONGUEUR_CODE,
        empreinte: empreinte(c.id, c.code),
      })
    }
  }, [
    { id: 'u-pharm', nom: 'Pharmacie', numero: PHARMACIE.numero, code: PHARMACIE.code, rayon: PHARMACIE.id },
    { id: 'u-men', nom: 'Ménage', numero: MENAGE.numero, code: MENAGE.code, rayon: MENAGE.id },
  ])
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
}

/* ---------- Les gestes ---------- */

async function taper(chiffres: string) {
  for (const c of chiffres) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
}

/** Entre par la porte du numero : dix chiffres, Entrer, cinq chiffres, Entrer. */
async function entrerParNumero(numero: string, code: string) {
  await taper(numero)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(900)
  await taper(code)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

async function sortir() {
  await page.locator('.qui:visible, .qui-btn:visible, .qui-btn-lg:visible').first().click()
  await page.waitForTimeout(900)
}

async function rayonOuvert(): Promise<string | null> {
  return page.locator('.rayon-etiquette__nom').first().innerText().catch(() => null)
}

/** Ce que le tiroir propose vraiment, et combien de ces choix sont cliquables. */
async function rayonsProposes(): Promise<{ noms: string[]; boutons: number }> {
  await page.locator('.menu-btn').click()
  await page.waitForTimeout(600)
  const noms = (await page.locator('.tiroir .seg-item').allInnerTexts()).map((n) => n.trim())
  /* Une pastille seule n'est pas un bouton : c'est ce qui distingue
     « on ne peut pas changer » de « le choix est cache ». */
  const boutons = await page.locator('.tiroir .seg-item[role="tab"]').count()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  return { noms, boutons }
}

async function allerVers(nom: string) {
  await page.locator('.menu-btn').click()
  await page.waitForTimeout(500)
  await page.locator('.tiroir .nav-item', { hasText: new RegExp(`^${nom}$`) }).click()
  await page.waitForTimeout(900)
}

/** Enregistre un produit par l'ecran Produits, comme le ferait la personne. */
async function enregistrerProduit(nom: string) {
  await allerVers('Produits')
  await page.getByRole('button', { name: 'Nouveau', exact: true }).click()
  await page.waitForTimeout(700)
  await page.locator('input.champ__saisie').first().fill(nom)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.waitForTimeout(900)
}

const rayonDuProduit = (nom: string) => page.evaluate(async (n: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const p = await base.produits.where('nomFr').equals(n).first()
  return p?.rayonId ?? null
}, nom)

/* ============================================================ */

titre('1. Un seul telephone porte bien les deux rayons')
await semerLesComptes()

const rayonsEnBase = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  return (await base.rayons.toArray()).map((r) => r.id).sort()
})
ok(rayonsEnBase.length === 2, `la base du telephone contient deux rayons (${JSON.stringify(rayonsEnBase)})`)

const comptesEnBase = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  return (await base.utilisateurs.toArray()).filter((u) => u.telephone).map((u) => u.telephone).sort()
})
ok(
  comptesEnBase.includes(PHARMACIE.numero) && comptesEnBase.includes(MENAGE.numero),
  `les deux comptes sont sur le meme telephone (${JSON.stringify(comptesEnBase)})`,
)

titre('2. Le numero de la pharmacie ouvre la pharmacie')
await entrerParNumero(PHARMACIE.numero, PHARMACIE.code)
ok((await rayonOuvert()) === PHARMACIE.rayon, `la session est sur ${PHARMACIE.rayon} (vu : ${await rayonOuvert()})`)

const vuePharm = await rayonsProposes()
ok(
  !vuePharm.noms.includes(MENAGE.rayon),
  `le rayon ${MENAGE.rayon} n'est pas propose (visibles : ${JSON.stringify(vuePharm.noms)})`,
)
ok(vuePharm.boutons === 0, 'aucun bouton de changement de rayon : rien a appuyer qui ne marche pas')
await page.screenshot({ path: 'captures/cloisonnement-pharmacie.png' })

titre('3. Un produit saisi la reste la')
await enregistrerProduit('Paracetamol de test')
ok((await rayonDuProduit('Paracetamol de test')) === PHARMACIE.id, 'le produit est enregistre dans Medicaments')

titre('4. Le numero du menage ouvre les menagers, sur le MEME telephone')
await sortir()
await entrerParNumero(MENAGE.numero, MENAGE.code)
ok((await rayonOuvert()) === MENAGE.rayon, `la session est sur ${MENAGE.rayon} (vu : ${await rayonOuvert()})`)

const vueMen = await rayonsProposes()
ok(
  !vueMen.noms.includes(PHARMACIE.rayon),
  `le rayon ${PHARMACIE.rayon} n'est pas propose (visibles : ${JSON.stringify(vueMen.noms)})`,
)
ok(vueMen.boutons === 0, 'aucun bouton de changement de rayon non plus ici')
await page.screenshot({ path: 'captures/cloisonnement-menage.png' })

titre('5. Le produit de la pharmacie reste invisible')
/* La donnee est dans la meme base, a quelques centimetres. Ce qui
   la separe n'est pas le support : c'est le compte ouvert. */
await allerVers('Produits')
const listeMen = await page.locator('body').innerText()
ok(!listeMen.includes('Paracetamol de test'), 'le produit de la pharmacie n apparait pas dans la liste des menagers')

await enregistrerProduit('Savon de test')
ok((await rayonDuProduit('Savon de test')) === MENAGE.id, 'un produit menager s ecrit bien dans Menagers')

titre("6. Le mot de passe de l'un n'ouvre pas le compte de l'autre")
await sortir()
await taper(MENAGE.numero)
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)
await taper(PHARMACIE.code)
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(1200)

const texteApresFaux = await page.locator('body').innerText()
ok((await page.locator('.ecran--connexion').count()) === 1, 'la porte reste fermee')
ok(texteApresFaux.includes('Mot de passe incorrect'), 'le refus est dit, et il dit « mot de passe » — pas « login »')
ok(!texteApresFaux.includes('Login inconnu'), 'le login est connu : dire le contraire serait faux')

titre('7. Un login que personne n a est dit inconnu')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await taper('9099999999')
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)
const texteInconnu = await page.locator('body').innerText()
ok(texteInconnu.includes('Login inconnu'), 'le login inconnu est distingue du mot de passe faux')

titre('8. Un login partage est refuse, meme avec le bon mot de passe')
/* Deux comptes sur un meme numero : on ne sait pas lequel ouvrir,
   et ouvrir le premier laisserait le code de l'un entrer dans le
   rayon de l'autre. On ferme donc les deux portes. */
await page.evaluate(async (numero: string) => {
  const { base } = await import('/src/donnees/base.ts')
  await base.utilisateurs.update('u-men', { telephone: numero })
}, PHARMACIE.numero)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await taper(PHARMACIE.numero)
await page.getByRole('button', { name: 'Entrer' }).click()
await page.waitForTimeout(900)
const textePartage = await page.locator('body').innerText()
ok(textePartage.includes('utilisé deux fois'), 'le numero partage est refuse, et la raison est dite')
ok((await page.locator('.ecran--connexion').count()) === 1, 'aucune des deux personnes n entre par un numero partage')

await contexte.close()
await navigateur.close()

console.log(echecs === 0
  ? '\nUN TELEPHONE, DEUX PERSONNES, CHACUN CHEZ SOI.'
  : `\n${echecs} ECHEC(S) — le cloisonnement ne tient pas.`)
process.exit(echecs === 0 ? 0 : 1)
