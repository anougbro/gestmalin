import { chromium } from 'playwright'
import { prepare } from './aide.ts'

/* ============================================================
   LE FIL DES ETATS D'UN COMPTE

   On rejoue dans l'ordre ce qui arrive a un compte reel :
   creation, autorisation, blocage, remise du code, suppression.
   A chaque etape, on demande a la base dans quel etat est la
   personne, et quel code ouvre encore sa porte.

   Ce n'est pas une verification — les verifications sont dans
   `verifier-comptes` et `verifier-codes`. C'est le fil qu'on
   relit quand on ne comprend plus pourquoi quelqu'un n'entre pas.
   ============================================================ */

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await prepare(page)
await page.waitForTimeout(1200)

const fil = await page.evaluate(async () => {
  const { base } = await import('/src/donnees/base.ts')
  const { autoriser, bloquer, debloquer, supprimer } = await import('/src/donnees/personnes.ts')
  const { connecter, empreinte, etatCompte, LONGUEUR_CODE } = await import('/src/domaine/acces.ts')

  const CODES = ['12345', '44444', '00000']

  const dir = {
    id: 'u-dir', nom: 'Directrice', role: 'directeur' as const,
    rayonsAutorises: ['r-med', 'r-men'], actif: true,
    independant: true, telephone: '9000000001',
    longueurCode: LONGUEUR_CODE, empreinte: empreinte('u-dir', '12345'),
  }
  const amina = {
    id: 'u-ami', nom: 'Amina', role: 'preparateur' as const,
    rayonsAutorises: ['r-men'], actif: false, enAttente: true,
    independant: true, telephone: '9000000002',
    longueurCode: LONGUEUR_CODE, empreinte: empreinte('u-ami', '44444'),
  }

  await base.utilisateurs.clear()
  await base.utilisateurs.bulkPut([dir, amina])

  async function instant(titre: string) {
    const tous = await base.utilisateurs.orderBy('nom').toArray()
    const lignes = tous.map((u) => {
      const ouvrent = CODES.filter((c) => connecter(tous, u.id, c).ok)
      return `${u.nom.padEnd(11)} ${u.role.padEnd(12)} ${etatCompte(u).padEnd(10)} ` +
        `codes qui ouvrent : ${ouvrent.length ? ouvrent.join(', ') : 'aucun'}`
    })
    return { titre, lignes }
  }

  const etapes = []
  etapes.push(await instant('1. Le compte vient d etre cree, il attend'))

  await autoriser('u-ami', dir)
  etapes.push(await instant('2. Le directeur autorise'))

  await bloquer('u-ami', dir)
  etapes.push(await instant('3. Le directeur bloque'))

  await debloquer('u-ami', dir, '00000')
  etapes.push(await instant('4. Le directeur remet 00000 (le blocage manuel reste)'))

  await autoriser('u-ami', dir)
  etapes.push(await instant('5. Le directeur rouvre le compte'))

  await supprimer('u-ami', dir)
  etapes.push(await instant('6. Le directeur supprime le compte'))

  return etapes
})

for (const e of fil) {
  console.log(`\n${e.titre}`)
  for (const l of e.lignes) console.log(`   ${l}`)
}

await navigateur.close()
