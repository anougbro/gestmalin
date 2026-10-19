import type { Page } from 'playwright'

/* ============================================================
   AIDE COMMUNE AUX VERIFICATEURS

   Au premier lancement, l'application pose une question avant le
   code : sur quel rayon ce telephone travaille. C'est voulu —
   chaque personne a son telephone.

   Aucun verificateur n'a a savoir comment ça marche : ils appellent
   `connecter`, qui repond a la question si elle est la, puis tape
   le code. Un verificateur qui echoue parce qu'une question
   nouvelle s est glisee dans le chemin devient un verificateur que
   personne ne relance.

   Le defaut serait d ignorer en silence : le script continuerait
   sur l'ecran de la question, cliquerait dans le vide, et
   rapporterait des echecs sans rapport avec ce qu il verifie. Si
   rien ne s ouvre, on le dit en clair, avec ce que l'ecran
   affiche reellement. */

const QUESTION = 'text=Que gères-tu ?'

/** Attend que le pave de chiffres soit pret, en repondant si besoin. */
export async function prepare(page: Page, rayon = 'Médicaments'): Promise<void> {
  await passerLaQuestion(page, rayon)

  /* On attend, on ne suppose pas. Sur un telephone lent — et sur
     un ordinateur qui charge le decodeur de code-barres — le pave
     peut mettre trois secondes a apparaitre. Un test qui suppose
     un delai fixe est un test qui echoue selon la machine. */
  const fin = Date.now() + 12_000
  while ((await page.locator('.pave__touche').count()) === 0) {
    if (Date.now() > fin) throw new Error(await queMontrage(page))
    await page.waitForTimeout(200)
  }
}

/**
 * Repond a la question du premier lancement, et rien d'autre.
 *
 * Ne leve pas d'erreur si la question n'est pas la : certains
 * scripts repassent par l'application apres s etre deja
 * connectes, ou sur un ecran ou aucun pave n'est attendu. La
 * seule regle : si la question est devant, on y repond.
 */
export async function passerLaQuestion(page: Page, rayon = 'Médicaments'): Promise<boolean> {
  const limite = Date.now() + 15_000
  for (;;) {
    if (await page.locator(QUESTION).count()) {
      await page.getByRole('button', { name: rayon }).click()
      await page.waitForTimeout(1200)
      return true
    }
    if (Date.now() > limite) return false
    /* On ne sait pas si l'application demarre encore. On sort
       des que le pave est la : le pave est la preuve qu'il n'y a
       plus de question. */
    if ((await page.locator('.pave__touche').count()) > 0) return false
    await page.waitForTimeout(250)
  }
}

/** Le pave est pret : on tape le code et on entre. */
export async function connecter(page: Page, code = '12345'): Promise<void> {
  await prepare(page)
  await taperCode(page, code)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

/** Tape un code chiffre par chiffre, comme une personne le fait. */
export async function taperCode(page: Page, code: string): Promise<void> {
  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
}

/** Ouvre le tiroir puis clique sur un geste du menu. */
export async function allerVers(page: Page, nom: string): Promise<void> {
  await page.locator('.menu-btn').click()
  await page.waitForTimeout(500)
  await page.locator('.tiroir .nav-item', { hasText: new RegExp(`^${nom}$`) }).click()
  await page.waitForTimeout(900)
}

/** Charge le jeu d'essai, s'il ne l'est pas deja. */
export async function chargerEssai(page: Page): Promise<void> {
  await allerVers(page, 'Réglages')
  await page.getByRole('button', { name: /Charger le jeu/ }).click()
  await page.waitForTimeout(2500)
  await page.locator('.entete__retour').click()
  await page.waitForTimeout(800)
}

async function queMontrage(page: Page): Promise<string> {
  const vu = await page.locator('body').innerText().catch(() => '')
  return (
    `Ni la question ni le pave de chiffres n'apparaissent.\n` +
    `L'application affiche :\n${vu.slice(0, 300)}`
  )
}