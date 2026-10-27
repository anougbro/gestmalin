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

   Depuis que le premier compte est cree par la premiere personne
   qui se presente, la base est VIDE au demarrage. Un verificateur
   ne peut donc plus compter sur un compte prepare : il seme le
   sien avec `semerComptes`, exactement comme le ferait la
   directrice a l'ouverture du telephone.

   Le defaut serait d ignorer en silence : le script continuerait
   sur l'ecran de connexion, cliquerait dans le vide, et
   rapporterait des echecs sans rapport avec ce qu il verifie. Si
   rien ne s ouvre, on le dit en clair, avec ce que l'ecran
   affiche reellement. */

export type CompteSeme = {
  id: string
  nom: string
  role: 'preparateur' | 'responsable' | 'pharmacien' | 'directeur'
  telephone: string
  code: string
  rayons?: string[]
}

/**
 * Le compte par defaut des verificateurs.
 *
 * `directeur` : c'est le role qui a le droit `utilisateurs`, donc
 * celui qui peut debloquer, transferer un rayon et remettre un mot
 * de passe. Les verificateurs qui touchent aux reglages en ont
 * besoin ; les autres s'en moquent, et un seul compte suffit.
 */
export const COMPTE_VERIF: CompteSeme = {
  id: 'u-verif',
  nom: 'Préparateur',
  role: 'directeur',
  telephone: '9000000001',
  code: '12345',
  rayons: ['r-med', 'r-men'],
}

/** Pose des comptes dans la base, sans passer par l'ecran. */
export async function semerComptes(
  page: Page,
  comptes: readonly CompteSeme[] = [COMPTE_VERIF],
): Promise<void> {
  await page.evaluate(async (liste) => {
    const { base } = await import('/src/donnees/base.ts')
    const { empreinte, LONGUEUR_CODE } = await import('/src/domaine/acces.ts')
    for (const c of liste) {
      await base.utilisateurs.put({
        id: c.id,
        nom: c.nom,
        role: c.role,
        rayonsAutorises: c.rayons ?? ['r-med', 'r-men'],
        actif: true,
        independant: true,
        telephone: c.telephone,
        longueurCode: LONGUEUR_CODE,
        empreinte: empreinte(c.id, c.code),
      })
    }
  }, comptes)

  /* L'ecran de connexion lit la liste des personnes au montage :
     sans rechargement, il continuerait d'afficher une liste vide. */
  await page.reload({ waitUntil: 'networkidle' })
  await prepare(page)
  await page.waitForTimeout(400)
}

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
  const secours = page.getByRole('button', { name: /oublié mon numéro/ })
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

/**
 * Cree le premier compte par l'ecran, comme une vraie personne.
 *
 * Indispensable pour les verificateurs qui tournent sur un site
 * CONSTRUIT : la-bas, `/src/...` n'existe plus, donc on ne peut pas
 * semer les comptes par import. Et de toute facon, c'est le
 * parcours reel d'installation.
 *
 * Le compte cree ouvre directement la session (l'ecran de creation
 * connecte la personne). Un appelant qui veut revenir a l'ecran de
 * connexion doit donc se deconnecter lui-meme.
 */
export async function creerCompte(
  page: Page,
  { nom, numero, code, rayon = 'Médicaments' }: {
    nom: string
    numero: string
    code: string
    rayon?: string
  },
): Promise<void> {
  await page.getByRole('button', { name: /Créer mon compte/ }).click()
  await page.waitForTimeout(500)
  await page.locator('input.champ__saisie').first().fill(nom)
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: rayon }).click()
  await page.waitForTimeout(400)

  /* Le numéro, puis deux fois le mot de passe : trois saisies au
     pave, comme dans l'application. */
  for (const saisie of [numero, code, code]) {
    for (const c of saisie) {
      await page.locator('.pave__touche', { hasText: new RegExp(`^${c}$`) }).first().click()
      await page.waitForTimeout(45)
    }
    await page.getByRole('button', { name: 'Entrer' }).click()
    await page.waitForTimeout(450)
  }

  await page.getByRole('button', { name: 'Passer', exact: true }).click()
  await page.waitForTimeout(1400)
}

/** Ouvre le tiroir puis clique sur un geste du menu. */export async function allerVers(page: Page, nom: string): Promise<void> {
  await page.locator('.menu-btn').click()
  await page.waitForTimeout(500)
  await page.locator('.tiroir .nav-item', { hasText: new RegExp(`^${nom}$`) }).click()
  await page.waitForTimeout(900)
}

/* ============================================================
   LE STOCK DES VERIFICATEURS

   L'application ne contient plus de jeu d'essai : une pharmacie
   ne doit pas porter de faux medicaments. Les verificateurs qui
   ont besoin de produits les posent donc eux-memes, ici, dans la
   base — jamais par un bouton de l'application.

   Les identifiants commencent par `v-` : ils ne peuvent pas
   entrer en collision avec une vraie saisie, et ils ne font pas
   partie des identifiants d'essai que la migration 5 efface.
   ============================================================ */

type GraineStock = {
  id: string
  rayon: string
  nom: string
  unite: 'boite' | 'plaquette' | 'piece' | 'sachet'
  seuil: number
  quantite: number
  emplacement: string
  peremption?: number
}

const STOCK_VERIF: GraineStock[] = [
  { id: 'v-para', rayon: 'r-med', nom: 'Paracétamol 500 mg', unite: 'boite', seuil: 20, quantite: 18, emplacement: 'z-sec-e1', peremption: 34 },
  { id: 'v-amox', rayon: 'r-med', nom: 'Amoxicilline 500 mg', unite: 'boite', seuil: 10, quantite: 12, emplacement: 'z-sec-e2', peremption: -4 },
  { id: 'v-ibu', rayon: 'r-med', nom: 'Ibuprofène 400 mg', unite: 'plaquette', seuil: 15, quantite: 9, emplacement: 'z-sec-e3', peremption: 58 },
  { id: 'v-doli', rayon: 'r-med', nom: 'Doliprane 1000 mg', unite: 'boite', seuil: 12, quantite: 26, emplacement: 'z-sec-e3' },
  { id: 'v-siro', rayon: 'r-med', nom: 'Sirop antitussif', unite: 'boite', seuil: 8, quantite: 7, emplacement: 'z-froi-e1' },
  { id: 'v-pans', rayon: 'r-med', nom: 'Pansement stérile', unite: 'piece', seuil: 30, quantite: 8, emplacement: 'z-sec-e5' },
  { id: 'v-the', rayon: 'r-men', nom: 'Thé vert en vrac', unite: 'boite', seuil: 5, quantite: 9, emplacement: 'z-men-e1' },
  { id: 'v-savon', rayon: 'r-men', nom: 'Savon de ménage', unite: 'piece', seuil: 30, quantite: 18, emplacement: 'z-men-e1' },
  { id: 'v-lessive', rayon: 'r-men', nom: 'Lessive en poudre', unite: 'sachet', seuil: 20, quantite: 6, emplacement: 'z-men-e2' },
]

/**
 * Pose un petit stock reel, dans les deux rayons.
 *
 * A appeler apres `semerComptes` (qui recharge la page et cree les
 * rayons, zones et emplacements au premier demarrage).
 */
export async function semerStock(page: Page, auteurId = COMPTE_VERIF.id): Promise<number> {
  const pose = await page.evaluate(async ({ graines, auteur }: { graines: GraineStock[]; auteur: string }) => {
    const { base, ATTENTE_ID } = await import('/src/donnees/base.ts')
    const { maintenant, nouvelId } = await import('/src/donnees/depots.ts')

    const jour = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
    const date = maintenant()

    for (const g of graines) {
      await base.produits.put({
        id: g.id,
        rayonId: g.rayon,
        categorieId: '',
        nomFr: g.nom,
        unite: g.unite,
        seuil: g.seuil,
        emplacementId: g.emplacement,
        actif: true,
      })
      const lotId = `${g.id}-lot`
      await base.lots.put({
        id: lotId,
        produitId: g.id,
        numero: `V${g.id.slice(2).toUpperCase()}`,
        ...(g.peremption === undefined ? {} : { peremption: jour(g.peremption) }),
        quantite: 0,
        emplacementId: g.emplacement,
      })
      await base.mouvements.put({
        id: nouvelId(),
        type: 'reception',
        rayonId: g.rayon,
        produitId: g.id,
        lotId,
        quantite: g.quantite,
        versEmplacementId: g.emplacement,
        auteurId: auteur,
        date,
        synchro: 0,
      })
    }

    /* Deux boites au quai : la reception n'est pas encore rangee.
       C'est un etat reel, pas une decoration de demonstration. */
    const auQuai = [
      { id: 'v-quai-med', rayon: 'r-med', nom: 'Métronidazole 500 mg' },
      { id: 'v-quai-men', rayon: 'r-men', nom: 'Éponge grattante' },
    ]
    for (const q of auQuai) {
      await base.produits.put({
        id: q.id,
        rayonId: q.rayon,
        categorieId: '',
        nomFr: q.nom,
        unite: 'boite',
        seuil: 10,
        actif: true,
      })
      const lotId = `${q.id}-lot`
      await base.lots.put({
        id: lotId,
        produitId: q.id,
        numero: `Q${q.id.slice(-3).toUpperCase()}`,
        quantite: 0,
        emplacementId: ATTENTE_ID,
      })
      await base.mouvements.put({
        id: nouvelId(),
        type: 'reception',
        rayonId: q.rayon,
        produitId: q.id,
        lotId,
        quantite: 8,
        versEmplacementId: ATTENTE_ID,
        auteurId: auteur,
        date,
        synchro: 0,
      })
    }

    return graines.length + auQuai.length
  }, { graines: STOCK_VERIF, auteur: auteurId })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await connecterSiBesoin(page)
  return pose
}

async function queMontrage(page: Page): Promise<string> {
  const vu = await page.locator('body').innerText().catch(() => '')
  return (
    `Le pave de chiffres n'apparait pas.\n` +
    `L'application affiche :\n${vu.slice(0, 300)}`
  )
}