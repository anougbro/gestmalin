import { chromium } from 'playwright'
import { connecterSiBesoin, prepare, semerComptes } from './aide.ts'
import { mkdirSync } from 'node:fs'

/* ============================================================
   LE SCAN, DE LA BOITE A LA BOITE

   Aucun test ne verifiait ce que la CAMERA alimente. Les tests
   portaient sur le decoupage d'une chaine — utile, mais
   insuffisant : le bug signale est survenu APRES la lecture, et
   aucun test ne regardait cet apres.

   Ici on ne simule pas la lecture : on FABRIQUE un vrai code
   EAN-13, on le dessine sur une toile, on la branche sur
   getUserMedia, et on laisse le vrai decodeur de l'application
   le trouver tout seul. Toute la chaine est exercee :
   camera -> ZXing -> decoupage -> base -> ecran -> validation.

   Pourquoi un encodeur ecrit a la main : ajouter une dependance
   pour dessiner un code-barres serait absurde dans une
   application qui a fait le choix explicite de n'avoir aucune
   dependance de lecture de fichier. L'EAN-13 tient en quinze
   lignes de tables.

   Les codes du jeu d'essai ont une cle de controle fausse
   (3400930123456 devrait finir par 4). Ce n'est pas un bug de
   l'application — elle ne verifie pas la cle, et un lecteur
   physique ne le fait pas non plus. Mais un decodeur, lui, la
   verifie : impossible donc de dessiner ceux-la. On utilise des
   codes valides, crees par le parcours de creation.
   ============================================================ */

const CODE_NEUF = '5901234123457'   /* valide, absent du catalogue */

mkdirSync('captures', { recursive: true })

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 393, height: 852 } })

let echecs = 0
const ok = (bon: boolean, message: string) => {
  if (!bon) echecs++
  console.log(`  ${bon ? 'OK   ' : 'ECHEC'} ${message}`)
}
const titre = (t: string) => console.log(`\n${t}`)

/* ---------- Une camera qui filme un code-barres ---------- */

await page.addInitScript(() => {
  /* ---- Encodeur EAN-13 ----
     13 chiffres = 12 chiffres + une cle de controle.
     Chaque chiffre du monde gauche s'imprime avec un motif
     impair ou pair, selon le premier chiffre ; celui de droite
     toujours en impair. C'est tout. */
  const PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']

  const bits = (code: string): string => {
    const d = code.split('').map(Number)
    let out = '101'
    for (let i = 0; i < 6; i++) out += PARITE[d[0]][i] === 'L' ? L[d[i + 1]] : G[d[i + 1]]
    out += '01010'
    for (let i = 0; i < 6; i++) out += R[d[i + 7]]
    return out + '101'
  }

  const M = 5                       /* largeur d'un module, en pixels */
  const ZONE = 11 * M               /* zone de silence, obligatoire */
  const toile = document.createElement('canvas')
  toile.width = 95 * M + 2 * ZONE
  toile.height = 300
  const ctx = toile.getContext('2d')!

  let courant = '5901234123457'
  const dessiner = (code: string) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, toile.width, toile.height)
    ctx.fillStyle = '#000000'
    let x = ZONE
    const haut = 90
    for (const b of bits(code)) {
      if (b === '1') ctx.fillRect(x, haut, M, 120)
      x += M
    }
  }

  /* Une toile IMMOBILE ne produit plus aucune image : le flux
     se tarit apres la premiere, et le decodeur n'a plus rien a
     regarder. Il faut donc redessiner en permanence. C'est le
     piege le plus couteux de toute cette verification — sans
     lui, le test echoue en.productsans qu'aucun code ne soit
     mal lu, et on cherche le bug ailleurs pendant une heure. */
  const battre = () => {
    dessiner(courant)
    requestAnimationFrame(battre)
  }
  battre()

  /* La camera du navigateur de test filme cette toile. Le flux
     est pris UNE fois ; comme la toile change de contenu, le
     flux suit — un nouveau code apparait sur l'ecran de la
     camera sans rien redemander. */
  navigator.mediaDevices.getUserMedia = async () =>
    toile.captureStream(30) as unknown as MediaStream

  ;(window as unknown as { __dessiner: (c: string) => void }).__dessiner = (c: string) => {
    courant = c
    dessiner(c)
  }
})

/* ---------- Navigation ---------- */

const attendre = (ms: number) => page.waitForTimeout(ms)

async function ouvrirMenu() {
  await page.locator('.menu-btn').click()
  await attendre(500)
}
async function allerVers(nom: string) {
  await ouvrirMenu()
  await page.locator('.tiroir .nav-item', { hasText: new RegExp(`^${nom}$`) }).click()
  await attendre(800)
}
async function scanner(code: string) {
  await page.evaluate((c) => (window as unknown as { __dessiner: (c: string) => void }).__dessiner(c), code)
  await page.locator('.btn--primaire', { hasText: /Scanner/ }).click()
  /* La camera a besoin de quelques images pour que ZXing accroche. */
  await attendre(4000)
}
const texteEcran = () => page.locator('body').innerText()

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

await prepare(page)
await semerComptes(page)
await attendre(1500)

/* ---------- Connexion ---------- */
titre('0. Connexion')

/* Entre si l'application demande un code : la session survit a
   un rechargement, donc elle est tantot ouverte, tantot a
   refaire. Demander une connexion dans les deux cas echouerait
   une fois sur deux, sur un ecran qui n'existe pas. */
async function connecterSession() {
  await connecterSiBesoin(page)
}

await connecterSession()
ok((await texteEcran()).includes('Réception') || (await page.locator('.menu-btn').count()) > 0, 'la session est ouverte')

await allerVers('Réglages')
await page.getByRole('button', { name: /Charger le jeu/ }).click()
await attendre(2500)
await page.locator('.entete__retour').click()
await attendre(800)

/* ---------- 1. La camera lit-elle reellement ? ---------- */
titre('1. La camera lit un code dessine')
await allerVers('Réception')
await scanner(CODE_NEUF)
const apresLecture = await texteEcran()
ok(!apresLecture.includes('Caméra indisponible'), 'la camera est demarree')
await page.screenshot({ path: 'captures/scan-boite-inconnue.png' })

/* ---------- 2. Produit inconnu : creation sur place ---------- */
titre('2. Produit jamais vu — le cas le plus courant')
ok(apresLecture.includes('Produit à créer'), 'le scan ouvre la fiche a creer')

/* La valeur d'un champ n'est pas du texte : `innerText` ne la
   voit pas. Il faut lire le champ. Une assertion posee sur le
   mauvais endroit echoue en criant que l'application est
   cassee, alors que c'est le test qui regarde au mauvais
   endroit. */
const codeRempli = await page.locator('input.champ__saisie').first().inputValue()
ok(codeRempli === CODE_NEUF, `le code lu est deja rempli (lu : ${codeRempli})`)

const champNom = page.locator('input.champ__saisie').nth(1)
await champNom.fill('Sirop test')
await page.screenshot({ path: 'captures/scan-creation.png' })
await page.getByRole('button', { name: /Créer et recevoir/ }).click()
await attendre(1500)
const apresCreation = await texteEcran()
ok(apresCreation.includes('Reçu'), 'la boite est enregistree')

/* ---------- 3. Le meme code, une seconde fois ---------- */
titre('3. Le meme code, une seconde fois')
await scanner(CODE_NEUF)
const apresDeuxieme = await texteEcran()
ok(apresDeuxieme.includes('Sirop test'), 'le produit est retrouve au catalogue')
ok(apresDeuxieme.includes('il ne reste que la quantité'), 'l ecran dit ce qu il reste a faire')
await page.screenshot({ path: 'captures/scan-produit-connu.png' })

/* Cette fois on valide vraiment. Scanner n'enregistre rien : la
   reception ne se termine que quand la personne appuie. C'est le
   comportement voulu — on verifie qu'il tient jusqu au bout. */
await page.getByRole('button', { name: 'Valider', exact: true }).click()
await attendre(1500)
ok((await texteEcran()).includes('Reçu'), 'la deuxieme boite est enregistree')

/* Le stock est verifie DANS LA BASE, jamais a l oeil. Un ecran
   qui dit « reçu » et une base qui n'a pas bouge, cela arrive :
   c'est tout l'interet d'une lecture du cote du donnee. */
const stockFinal = await page.evaluate(async (id: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const { quantiteProduit } = await import('/src/domaine/stock.ts')
  const p = await base.produits.where('codeBarres').equals(id).first()
  if (!p) return -1
  const m = await base.mouvements.where('produitId').equals(p.id).toArray()
  return quantiteProduit(p.id, m)
}, CODE_NEUF)
ok(stockFinal === 2, `la base compte 2 boites (recu ${stockFinal})`)

/* ---------- 4. Le produit est dans l autre rayon ---------- */
titre('4. Le produit est dans l autre rayon')

/* On ne peut plus changer de rayon depuis le menu : un telephone
   qui ne gere qu'un seul rayon n'affiche plus de bouton, et c'est
   exactement le comportement voulu.

   Le cas reel se construit donc autrement : un produit qui VIT
   dans le rayon d'une autre personne. On l'ecrit dans la base
   depuis l'autre point de vue — une vraie base distante, sur un
   autre telephone — puis on le scanne ici. */
const CODE_ETRANGER = '4006381333931'
await page.evaluate(async (code: string) => {
  const { base, ATTENTE_ID } = await import('/src/donnees/base.ts')
  const { nouvelId, maintenant } = await import('/src/donnees/depots.ts')

  /* Ce produit appartient au rayon que CE telephone ne gere pas. */
  const id = 'p-etranger'
  if (!(await base.produits.get(id))) {
    await base.produits.add({
      id, rayonId: 'r-men', categorieId: '', nomFr: 'Sérum du voisin',
      codeBarres: code, unite: 'boite', seuil: 0, actif: true,
    } as never)
    await base.mouvements.add({
      id: nouvelId(), type: 'reception', rayonId: 'r-men', produitId: id,
      quantite: 4, versEmplacementId: ATTENTE_ID, motif: 'reception',
      auteurId: 'u-9', date: maintenant(), synchro: 0,
    } as never)
  }
}, CODE_ETRANGER)
await page.reload({ waitUntil: 'networkidle' })
await attendre(1800)
await connecterSession()
await allerVers('Réception')

await scanner(CODE_ETRANGER)
const apresMcn = await texteEcran()
ok(apresMcn.includes('Ménagers'), 'le bon rayon est annoncé')
ok(!apresMcn.includes('Code inconnu'), 'et non « code inconnu », qui serait faux')
await page.screenshot({ path: 'captures/scan-autre-rayon.png' })

/* Et surtout : il ne se passe RIEN d'autre. Pas de creation, pas
   d'enregistrement. Une reception dans le mauvais rayon est
   exactement ce qu on cherche a empecher. */
const stockEtranger = await page.evaluate(async (code: string) => {
  const { base } = await import('/src/donnees/base.ts')
  const p = await base.produits.where('codeBarres').equals(code).first()
  return { mouvements: p ? (await base.mouvements.where('produitId').equals(p.id).toArray()).length : -1, rayon: p?.rayonId ?? null }
}, CODE_ETRANGER)
ok(stockEtranger.mouvements === 1, `aucun mouvement n a ete ajoute (${stockEtranger.mouvements})`)
ok(stockEtranger.rayon === 'r-men', `le produit est toujours dans Menagers (${stockEtranger.rayon})`)

/* ---------- Bilan ---------- */
console.log(echecs === 0
  ? '\nLE SCAN AJOUTE BIEN LE PRODUIT.'
  : `\n${echecs} ECHEC(S) — le scan ne fonctionne pas encore.`)
console.log('\nNote : la lecture parasite — un code lu qui n est pas un\ncode-barres — est verifiee par les tests unitaires\n(src/domaine/codeBarres.test.ts et reception.test.ts), pas ici.\nFabriquer un code volontairement illisible demanderait un\nencodeur de plus, pour couvrir trois lignes de logique pure.')
await navigateur.close()
process.exit(echecs === 0 ? 0 : 1)
