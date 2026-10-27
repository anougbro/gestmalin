import type { Page } from 'playwright'

/* ============================================================
   AIDE COMMUNE AUX VERIFICATEURS

   L'application demande un numero de telephone, puis un code.
   Aucun verificateur n'a a savoir comment ça marche : ils appellent
   `connecter`, qui passe par la porte de secours — la liste des
   noms, puis un code de cinq chiffres. C'est le chemin le plus
   court pour un script, et c'est aussi une vraie porte de
   l'application : si elle cessait de fonctionner, tous les
   verificateurs casseraient en meme temps.

   Le defaut serait d ignorer en silence : le script continuerait
   sur l'ecran de connexion, cliquerait dans le vide, et
   rapporterait des echecs sans rapport avec ce qu il verifie. Si
   rien ne s ouvre, on le dit en clair, avec ce que l'ecran
   affiche reellement. */

/** Attend que le pave de chiffres soit pret. */
export async function prepare(page: Page): Promise<void> {
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
 * Entre par le NOM plutot que par le numero.
 *
 * C'est le chemin court : un pave de cinq chiffres, sans avoir a
 * taper dix chiffres avant. Il existe justement pour cela — et il
 * ouvre exactement les memes comptes que l'autre porte, ce que les
 * tests unitaires verifient.
 */
export async function connecterParNom(page: Page, nom: string, code = '12345'): Promise<void> {
  await prepare(page)
  const secours = page.getByRole('button', { name: /oublié mon login/ })
  if (await secours.count()) {
    await secours.click()
    await page.waitForTimeout(500)
  }
  await page.locator('.personne', { hasText: nom }).first().click()
  await page.waitForTimeout(500)
  for (const c of code) {
    await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
    await page.waitForTimeout(60)
  }
  await page.getByRole('button', { name: 'Entrer' }).click()
  await page.waitForTimeout(1400)
}

/** Entre comme le ferait une personne, par la porte de secours. */
export async function connecter(page: Page, code = '12345', nom = 'Préparateur'): Promise<void> {
  await connecterParNom(page, nom, code)
}

/**
 * Entre SEULEMENT si l'application le demande.
 *
 * La session vit dans sessionStorage : elle survit a un
 * rechargement, et meurt avec l'onglet. Un script qui recharge la
 * page pour relire des donnees se retrouve donc tantot devant le
 * pave, tantot deja a l'interieur.
 *
 * Demander une connexion dans les deux cas echoue une fois sur
 * deux — et l'echec ne dit rien de ce que le script verifie. On
 * regarde donc si le pave est la avant d'y toucher.
 */
export async function connecterSiBesoin(page: Page, nom = 'Préparateur', code = '12345'): Promise<void> {
  if ((await page.locator('.pave__touche').count()) === 0) return
  await connecterParNom(page, nom, code)
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
    `Le pave de chiffres n'apparait pas.\n` +
    `L'application affiche :\n${vu.slice(0, 300)}`
  )
}