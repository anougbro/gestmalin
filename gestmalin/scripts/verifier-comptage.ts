import { chromium } from 'playwright'
import { prepare } from './aide.ts'
import { mkdirSync } from 'node:fs'

/* ============================================================
   COMTER : LE BADGE ABC ET LE RECOMPTE A DEUX

   Deux garde-fous du cahier des charges etaient ecrits, commentes,
   illustres meme — et n'existaient nulle part dans le programme.
   Le champ `recompte` etait declare dans le modele de donnees.
   Le champ `badgeABC` aussi. Ni l'un ni l'autre n'etaient jamais
   remplis, ni affiches, ni testes.

   Un test qui verifie l'absence d'un ecart est le seul genre de
   test qui disparait quand le bug est corrige. C'est donc au
   navigateur qu'on va verifier que la regle TIENT : qu'un ecart
   important ne peut pas etre enregistre au premier compte, et
   qu'un produit A s'affiche en tete de comptage.
   ============================================================ */

mkdirSync('captures', { recursive: true })

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })

let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK   ' : 'ECHEC'} ${message}`)
}
const titre = (t: string) => console.log(`\n${t}`)
const attendre = (ms: number) => page.waitForTimeout(ms)

async function allerVers(nom: string) {
  await page.locator('.menu-btn').click()
  await attendre(500)
  await page.locator('.tiroir .nav-item', { hasText: new RegExp(`^${nom}$`) }).click()
  await attendre(900)
}

/* On recharge pour que l'ecran relise les mouvements ajoutes.
   La session survit au rechargement : on ne remet le code que si
   le pave est vraiment la. */
async function connecter() {
  if ((await page.locator('.pave__touche').count()) === 0) return
  for (const c of '12345') {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await attendre(60)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await attendre(1200)
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

await prepare(page)
await attendre(1500)
await connecter()

await allerVers('Réglages')
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await attendre(2500)
await page.locator('.entete__retour').click()
await attendre(800)

/* ---------- On fabrique un rayon teste a la main ---------- */

titre('0. Un rayon prepare')
const effectif = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  const { nouvelId, maintenant } = await import('/src/donnees/depots.ts')
  const { ATTENTE_ID } = await import('/src/donnees/base.ts')

  const produits = await base.produits.where('rayonId').equals('r-med').toArray()
  const existants = produits.length
  if (existants < 3) return { existants, ajoutes: 0 }

  /* Trois profils de rotation distincts, pour que le classement
     ait quelque chose a classer. Un produit qui sort 300 fois,
     un qui sort 30, un qui ne sort jamais. */
  const profils = [
    { nom: 'Produit vif (rotation)', rotations: 300 },
    { nom: 'Produit lent (rotation)', rotations: 30 },
    { nom: 'Produit fige (rotation)', rotations: 0 },
  ]
  const aujourdhui = maintenant().slice(0, 10)

  for (const p of profils) {
    const id = nouvelId()
    await base.produits.add({
      id, rayonId: 'r-med', categorieId: '',
      nomFr: p.nom, codeBarres: '9' + id.slice(0, 11).padEnd(11, '0'),
      unite: 'boite', seuil: 0, actif: true,
    } as never)
    await base.mouvements.add({
      id: nouvelId(), type: 'reception', rayonId: 'r-med', produitId: id,
      quantite: p.rotations + 5, versEmplacementId: ATTENTE_ID,
      motif: 'reception', auteurId: 'u1', date: aujourdhui, synchro: 0,
    } as never)
    for (let i = 0; i < p.rotations; i += 10) {
      await base.mouvements.add({
        id: nouvelId(), type: 'sortie', rayonId: 'r-med', produitId: id,
        quantite: Math.min(10, p.rotations - i),
        depuisEmplacementId: ATTENTE_ID, motif: 'delivrance',
        auteurId: 'u1', date: aujourdhui, synchro: 0,
      } as never)
    }
  }
  return { existants, ajoutes: profils.length }
})
console.log(`  ${effectif.existants} produits du jeu d'essai, ${effectif.ajoutes} ajoutes pour le test`)
await page.reload({ waitUntil: 'networkidle' })
await attendre(1500)
await connecter()

/* ---------- 1. Le badge est affiche ---------- */
titre('1. Le badge ABC est affiche')
await allerVers('Compter')
const badges = await page.locator('.badge-abc').count()
ok(badges > 0, `le badge est present sur l'ecran de comptage (${badges} trouve(s))`)
await page.screenshot({ path: 'captures/comptage-badge.png' })

const textePremier = await page.locator('.carte p').first().innerText().catch(() => '')
ok(textePremier.includes('vif'), `le produit le plus vif passe en premier (« ${textePremier} »)`)

/* ---------- 2. La quantite attendue reste cachee ---------- */
titre('2. Le comptage reste impartial')
const corps = await page.locator('.ecran').innerText()
/* On ne cherche pas « le total du rayon » : il est legitimate
   d'afficher combien de produits restent. Ce qui ne doit
   JAMAIS apparaitre, c'est une quantite de stock. Le produit
   vif a 305 boites ; ce chiffre ne doit etre nulle part. */
ok(!corps.includes('305'), 'la quantite attendue du produit n est pas affichee')
ok(corps.includes('ne te montre pas'), 'l ecran dit pourquoi')
ok(corps.includes('Compte ce que tu vois'), 'l consigne de comptage est presente')

/* ---------- 3. L ecart important bloque l avancement ---------- */
titre('3. Un ecart important impose le recompte')
/* On saisit ZERO : pour un produit attendu non nul, c'est une
   disparition, donc l'ecart le plus grave qui existe. */
await page.getByRole('button', { name: 'Zéro' }).click()
await attendre(400)
const corpsEcart = await page.locator('.ecran').innerText()
ok(corpsEcart.includes('Écart important'), 'l ecart grave est signale en rouge')
ok(corpsEcart.includes('Recompte ce produit une deuxième fois'), 'un recompte est demande')
await page.screenshot({ path: 'captures/comptage-ecart.png' })

const bandeauRouge = await page.locator('.bandeau--dgr').count()
ok(bandeauRouge > 0, 'le bandeau utilise bien la couleur rouge (agir)')

/* Le bouton doit ANNONCER le recompte avant qu'on l'appuie. Une
   consigne qui n'apparait qu'apres un echec oblige a recommencer
   a chaque fois. */
const libelle = await page.getByRole('button', { name: 'Recompter' }).count()
ok(libelle === 1, 'le bouton annonce « Recompter » avant même qu on le presse')

/* Comparer tout l ecran ne prouve rien : le bandeau change de
   texte quand le premier compte est memorise. Ce qu il faut
   verifier, c'est la POSITION — le compteur « n / total » — et
   le nom du produit affiche. */
const position = async () => (await page.locator('.ecran').innerText()).split('\n').slice(0, 3).join('|')
const positionAvant = await position()
await page.getByRole('button', { name: 'Recompter' }).click()
await attendre(500)
const positionApres = await position()
ok(positionAvant === positionApres, `appuyer sur Recompter ne fait PAS avancer (${positionAvant} -> ${positionApres})`)
ok((await page.locator('.carte p').first().innerText()).includes('vif'), 'le compteur est toujours sur le meme produit')

/* ---------- 4. Le pave se vide : il faut recompter vraiment ---------- */
titre('4. Le pave se vide — on ne peut pas valider sans recompter')
const corpsRecompte = await page.locator('.ecran').innerText()
ok(corpsRecompte.includes('Deuxième compte'), 'un second compte est demande')
ok(corpsRecompte.includes('Premier compte'), 'le premier compte reste visible')

/* Le pave est un champ de saisie, pas du texte : on lit sa
   valeur, on ne lit pas son contenu. */
const pave = page.locator('.stepper__valeur')
const paveVide = await pave.inputValue()
ok(paveVide === '0', `le pave repart a zero (il affiche « ${paveVide} »)`)
const boutonInactif = await page.getByRole('button', { name: 'Valider', exact: true }).isDisabled()
ok(boutonInactif, 'Valider est refuse tant que rien n a ete recompte')

/* ---------- 5. Le second compte libere la ligne ---------- */
titre('5. Le second compte libere la ligne')
await page.locator('.stepper button[aria-label="Plus"]').first().click()
await page.locator('.stepper button[aria-label="Plus"]').first().click()
await attendre(300)
await page.getByRole('button', { name: 'Valider', exact: true }).click()
await attendre(600)
const apresRecompte = await page.locator('.ecran').innerText()
ok(!apresRecompte.includes('Deuxième compte'), 'apres le second compte, la ligne passe')
await page.screenshot({ path: 'captures/comptage-apres-recompte.png' })

/* ---------- Bilan ---------- */
console.log(echecs === 0
  ? '\nLE COMPTE TIENT CE QU IL ANNONCAIT.'
  : `\n${echecs} ECHEC(S) — un garde-fou annonce n est pas applique.`)
await navigateur.close()
process.exit(echecs === 0 ? 0 : 1)
