/* Remplit la base avec des données realistes, puis capture les
   ecrans qui affichent des LISTES. Un ecran vide ne prouve rien :
   c'est une liste de produits ou d'alertes qui casse une mise en
   page, pas une page blanche. */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('captures', { recursive: true })

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({
  ...devices['Pixel 5'],
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 2,
  locale: 'fr',
})
const page = await contexte.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

const problemes: string[] = []

/* On parle directement a IndexedDB : l'interface ne prevoit pas
   encore de saisie rapide de masse, et ce qu'on veut tester ici
   c'est l'AFFICHAGE, pas la saisie. */
await page.evaluate(async () => {
  const base: IDBFactory = indexedDB

  const db = await new Promise<IDBDatabase>((res, rej) => {
    /* On ouvre SANS version : IndexedDB refuse d'ouvrir une base
       en dessous de sa version actuelle, et la bonne version
       n'est pas un nombre qu'on devine. */
    const r = base.open('gestmalin')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

  const ecrire = (magasin: string, lignes: unknown[]) =>
    new Promise<void>((res, rej) => {
      const tx = db.transaction(magasin, 'readwrite')
      const obj = tx.objectStore(magasin)
      for (const l of lignes) obj.put(l)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })

  const aujourdhui = new Date().toISOString()
  const dans = (jours: number) => new Date(Date.now() + jours * 86400000).toISOString().slice(0, 10)

  const produits = [
    { id: 'p1', rayonId: 'r-med', categorieId: 'c1', nomFr: 'Paracétamol 500 mg comprimé', codeBarres: '3400930123456', unite: 'boite', seuil: 20, actif: true, dci: 'PARACETAMOL', forme: 'comprimé', paysOrigine: 'FR' },
    { id: 'p2', rayonId: 'r-med', categorieId: 'c1', nomFr: 'Amoxicilline 500 mg gélules', codeBarres: '3400930111111', unite: 'boite', seuil: 10, actif: true, dci: 'AMOXICILLINE' },
    { id: 'p3', rayonId: 'r-med', categorieId: 'c2', nomFr: 'Ibuprofène 400 mg', codeBarres: '3400930222222', unite: 'plaquette', seuil: 15, actif: true },
    { id: 'p4', rayonId: 'r-med', categorieId: 'c2', nomFr: 'Sérum physiologique 500 ml', codeBarres: '3400930333333', unite: 'boite', seuil: 5, actif: true },
    { id: 'p5', rayonId: 'r-med', categorieId: 'c3', nomFr: 'Seringue 5 ml', codeBarres: '3400930444444', unite: 'piece', seuil: 50, actif: true },
    { id: 'p6', rayonId: 'r-med', categorieId: 'c1', nomFr: 'Doliprane 1000 mg comprimé pelliculé', codeBarres: '3400930555555', unite: 'boite', seuil: 12, actif: true },
    { id: 'p7', rayonId: 'r-med', categorieId: 'c1', nomFr: 'Sirop pour la toux, 150 ml', codeBarres: '3400930666666', unite: 'boite', seuil: 8, actif: true },
    { id: 'p8', rayonId: 'r-med', categorieId: 'c1', nomFr: 'Amoxicilline 250 mg suspension buvable', unite: 'boite', seuil: 10, actif: true },
  ]

  const emplacements = ['z-sec-e1', 'z-sec-e2', 'z-sec-e3', 'z-sec-e4']

  const lots = [
    { id: 'l1', produitId: 'p1', numero: 'A2X9F', peremption: dans(12), quantite: 0, emplacementId: 'z-sec-e1' },
    { id: 'l2', produitId: 'p1', numero: 'B7K2P', peremption: dans(700), quantite: 0, emplacementId: 'z-sec-e1' },
    { id: 'l3', produitId: 'p2', numero: 'C1D3E', peremption: dans(-3), quantite: 0, emplacementId: 'z-sec-e2' },
    { id: 'l4', produitId: 'p3', numero: 'F4G5H', peremption: dans(45), quantite: 0, emplacementId: 'z-sec-e3' },
    { id: 'l5', produitId: 'p5', numero: 'J6K7L', peremption: dans(400), quantite: 0, emplacementId: 'z-sec-e4' },
    { id: 'l6', produitId: 'p7', numero: 'M8N9P', peremption: dans(200), quantite: 0, emplacementId: 'z-froi-e1' },
  ]

  const mouvements = [
    { id: 'm1', type: 'reception', rayonId: 'r-med', produitId: 'p1', lotId: 'l1', quantite: 40, versEmplacementId: 'z-sec-e1', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm2', type: 'reception', rayonId: 'r-med', produitId: 'p1', lotId: 'l2', quantite: 60, versEmplacementId: 'z-sec-e1', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm3', type: 'sortie', rayonId: 'r-med', produitId: 'p1', lotId: 'l1', quantite: 12, depuisEmplacementId: 'z-sec-e1', motif: 'delivrance', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm4', type: 'reception', rayonId: 'r-med', produitId: 'p2', lotId: 'l3', quantite: 18, versEmplacementId: 'z-sec-e2', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm5', type: 'sortie', rayonId: 'r-med', produitId: 'p2', lotId: 'l3', quantite: 4, depuisEmplacementId: 'z-sec-e2', motif: 'delivrance', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm6', type: 'reception', rayonId: 'r-med', produitId: 'p3', lotId: 'l4', quantite: 30, versEmplacementId: 'z-sec-e3', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm7', type: 'reception', rayonId: 'r-med', produitId: 'p5', lotId: 'l5', quantite: 22, versEmplacementId: 'z-sec-e4', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm8', type: 'reception', rayonId: 'r-med', produitId: 'p7', lotId: 'l6', quantite: 9, versEmplacementId: 'z-froi-e1', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm9', type: 'reception', rayonId: 'r-med', produitId: 'p4', quantite: 14, versEmplacementId: 'attente-quai', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm10', type: 'reception', rayonId: 'r-med', produitId: 'p6', quantite: 25, versEmplacementId: 'attente-quai', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
    { id: 'm11', type: 'reception', rayonId: 'r-med', produitId: 'p8', quantite: 7, versEmplacementId: 'attente-quai', auteurId: 'u-1', date: aujourdhui, synchro: 0 },
  ]

  await ecrire('produits', produits)
  await ecrire('lots', lots)
  await ecrire('mouvements', mouvements)
  void emplacements
  db.close()
})

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: 'captures/donnees-accueil.png', fullPage: true })

for (const ecran of ['Trouver', 'Alertes', 'Compter', 'Ranger', 'Produits']) {
  const b = page.getByRole('button', { name: ecran, exact: true }).locator('visible=true').first()
  if (!(await b.count())) { problemes.push(`${ecran} : inaccessible`); continue }
  await b.click()
  await page.waitForTimeout(800)
  const nom = ecran.toLowerCase()
  await page.screenshot({ path: `captures/donnees-${nom}.png`, fullPage: true })

  const deborde = await page.evaluate(() => {
    const l = document.documentElement.clientWidth
    const coupables: string[] = []
    if (document.documentElement.scrollWidth > l) coupables.push('defilement horizontal')
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > l + 1) coupables.push(`${el.tagName.toLowerCase()}.${el.className} depasse de ${Math.round(r.right - l)}px`)
    }
    return coupables.slice(0, 5)
  })
  for (const d of deborde) problemes.push(`${ecran} : ${d}`)

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

await navigateur.close()
console.log(problemes.length ? `PROBLEMES :\n - ` + problemes.join('\n - ') : 'Aucun debordement avec des donnees reelles.')