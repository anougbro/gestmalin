import { COLONNES, ecrireCSV, ecrireXLSX, type NomColonne } from './fichiers'
import { base } from './base'
import { maintenant, nouvelId } from './depots'
import { produits } from './depots'
import type { LotRow, ProduitRow } from './base'
import type { Lot } from '../domaine/types'

/* ============================================================
   L'ECHANGE DE FICHIERS

   Le format d'export EST le format d'import. Meme ordre de
   colonnes, meme nom. C'est ce qui garantit qu'un aller-retour
   ne perd rien.

   Deux modes, volontairement separes :
   - CATALOGUE : cree et met a jour des fiches produits
   - STOCK     : enregistre des quantites, en mouvements

   Why mixed would be dangerous : corriger une quantite dans un
   tableur puis reimporter ecraserait l'historique. Ici, STOCK
   passe par le journal comme tout le reste.
   ============================================================ */

export type ModeImport = 'catalogue' | 'stock'

export type LigneLue = {
  numero: number
  valeurs: Partial<Record<NomColonne, string>>
  problemes: string[]
  /* Renseignes apres confrontation a la base */
  action: 'creer' | 'mettre_a_jour' | 'ignorer' | 'conflit'
  existantId?: string
  quantiteExistante?: number
}

export type Simulation = {
  lignes: LigneLue[]
  aCreer: number
  aMettreAJour: number
  aIgnorer: number
  conflits: number
  produitsInconnus: string[]
}

/* ---------- 1. Lire le fichier et le mettre en forme ---------- */

const ALIAS: Record<string, NomColonne> = {
  rayon: 'rayon', nom_rayon: 'rayon', rayon_nom: 'rayon',
  categorie: 'categorie', nom_categorie: 'categorie', categorie_nom: 'categorie',
  nom: 'nom_fr', nom_fr: 'nom_fr', designation: 'nom_fr', libelle: 'nom_fr',
  nom_en: 'nom_en', nom_anglais: 'nom_en',
  code_barres: 'code_barres', codebarres: 'code_barres', barcode: 'code_barres', ean: 'code_barres',
  unite: 'unite',
  seuil: 'seuil', seuil_alerte: 'seuil', stock_min: 'seuil',
  quantite: 'quantite', qte: 'quantite', stock: 'quantite',
  lot: 'lot', numero_lot: 'lot', n_lot: 'lot',
  peremption: 'peremption', date_peremption: 'peremption', dlu: 'peremption', expires: 'peremption',
  fournisseur: 'fournisseur', nom_fournisseur: 'fournisseur',
  zone: 'zone',
  emplacement: 'emplacement', code_emplacement: 'emplacement',
}

export type Correspondance = Partial<Record<NomColonne, number>>

/** Devine la correspondance a partir de l'entete du fichier. */
export function devinerCorrespondance(entetes: string[]): Correspondance {
  const correspondance: Correspondance = {}
  entetes.forEach((entete, index) => {
    const clef = entete.trim().toLowerCase().replace(/\s+/g, '_')
    const colonne = ALIAS[clef]
    if (colonne && correspondance[colonne] === undefined) correspondance[colonne] = index
  })
  return correspondance
}

function controlerQuantite(valeur: string | undefined): { nombre?: number; probleme?: string } {
  if (!valeur || valeur.trim() === '') return {}
  const nombre = Number(valeur.replace(',', '.'))
  if (!Number.isFinite(nombre)) return { probleme: `quantité illisible : « ${valeur} »` }
  if (nombre < 0) return { probleme: 'quantité négative' }
  return { nombre: Math.floor(nombre) }
}

function normaliserDate(valeur: string | undefined): { iso?: string; probleme?: string } {
  if (!valeur || valeur.trim() === '') return {}
  const brut = valeur.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return { iso: brut }

  /* JJ/MM/AAAA et JJ-MM-AAAA, tres courants dans les tableurs. */
  const fr = brut.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (fr) {
    const [, j, m, a] = fr
    if (Number(m) < 1 || Number(m) > 12) return { probleme: `mois illisible : « ${brut} »` }
    return { iso: `${a}-${m.padStart(2, '0')}-${j.padStart(2, '0')}` }
  }

  /* AAMMJJ : le format des codes GS1, qu'on peut lire a la main. */
  if (/^\d{6}$/.test(brut)) return { iso: `20${brut.slice(0, 2)}-${brut.slice(2, 4)}-${brut.slice(4, 6)}` }

  return { probleme: `date illisible : « ${brut} »` }
}

/* ---------- 2. La simulation ---------- */

export async function simulerImport(
  tableau: string[][],
  correspondance: Correspondance,
  mode: ModeImport,
): Promise<Simulation> {
  const [entetes, ...corps] = tableau
  if (!entetes) throw new Error('Le fichier est vide.')

  const inconnues = entetes.filter((_, i) => !Object.values(correspondance).includes(i))
  if (inconnues.length > 0) {
    throw new Error(
      `Colonnes non reconnues : ${inconnues.join(', ')}. ` +
      `Corrige la correspondance avant d'importer.`,
    )
  }

  const lecture = (ligne: string[], colonne: NomColonne): string | undefined => {
    const index = correspondance[colonne]
    if (index === undefined) return undefined
    const valeur = ligne[index]
    return valeur === undefined || valeur === '' ? undefined : valeur.trim()
  }

  const rayons = await base.rayons.toArray()
  const produitsExistants = await base.produits.toArray()
  const parCode = new Map(produitsExistants.filter((p) => p.codeBarres).map((p) => [p.codeBarres!, p]))
  const mouvements = await base.mouvements.toArray()

  const lignes: LigneLue[] = []

  for (const [index, brute] of corps.entries()) {
    const problemes: string[] = []
    const valeurs: Partial<Record<NomColonne, string>> = {}

    for (const colonne of COLONNES) {
      const v = lecture(brute, colonne)
      if (v !== undefined) valeurs[colonne] = v
    }

    if (!valeurs.nom_fr) problemes.push('nom manquant')
    if (mode === 'stock' && valeurs.quantite === undefined && !valeurs.lot) {
      problemes.push('ni quantité ni lot')
    }

    const date = normaliserDate(valeurs.peremption)
    if (date.probleme) problemes.push(date.probleme)
    if (date.iso) valeurs.peremption = date.iso

    const qte = controlerQuantite(valeurs.quantite)
    if (qte.probleme) problemes.push(qte.probleme)

    /* Le rayon doit exister. On ne cree pas un rayon a l'import :
       c'est une decision de structure, pas de donnee. */
    const nomRayon = valeurs.rayon?.toLowerCase()
    const rayonTrouve = nomRayon
      ? rayons.find((r) => r.nom.toLowerCase() === nomRayon || r.id === valeurs.rayon)
      : undefined
    if (nomRayon && !rayonTrouve) problemes.push(`rayon inconnu : « ${valeurs.rayon} »`)

    /* Conflit de code-barres : deux produits deja distincts qui
       porteraient le meme code. On ne fusionne JAMAIS tout seul. */
    const code = valeurs.code_barres
    const titulaire = code ? parCode.get(code) : undefined
    /* Le code-barres designe un produit SEUL. Si le nom du fichier
       ne correspond pas, c'est un conflit : deux produits
       différents porteraient le meme code et le scan deviendrait
       impossible a trancher. On ne fusionne jamais tout seul. */
    const nomDuFichier = valeurs.nom_fr?.toLowerCase()
    const nomDiffere = titulaire !== undefined && nomDuFichier !== undefined
      && titulaire.nomFr.toLowerCase() !== nomDuFichier

    const existeParCode: ProduitRow | undefined =
      titulaire !== undefined && (!nomDuFichier || titulaire.nomFr.toLowerCase() === nomDuFichier)
        ? titulaire
        : undefined

    const existeParNom = produitsExistants.find(
      (p) => nomDuFichier !== undefined && p.nomFr.toLowerCase() === nomDuFichier &&
        (!rayonTrouve || p.rayonId === rayonTrouve.id),
    )

    /* Le produit deja connu qu'on va mettre a jour : par code-barres
       s'il correspond au nom, sinon par nom dans le rayon. */
    const dejaConnu: ProduitRow | undefined = existeParCode ?? existeParNom

    let action: LigneLue['action'] = 'creer'
    let existantId: string | undefined
    if (nomDiffere) action = 'conflit'
    else if (dejaConnu) { action = 'mettre_a_jour'; existantId = dejaConnu.id }
    if (problemes.length > 0 && action !== 'conflit') action = 'ignorer'

    let quantiteExistante: number | undefined
    if (existantId) {
      quantiteExistante = mouvements
        .filter((m) => m.produitId === existantId)
        .reduce((s, m) => s + m.quantite * (m.type === 'reception' ? 1 : m.type === 'transfert' ? 0 : -1), 0)
    }

    lignes.push({ numero: index + 2, valeurs, problemes, action, existantId, quantiteExistante })
  }

  const rayonsVus = new Set(corps.map((l) => lecture(l, 'rayon')).filter(Boolean) as string[])

  return {
    lignes,
    aCreer: lignes.filter((l) => l.action === 'creer').length,
    aMettreAJour: lignes.filter((l) => l.action === 'mettre_a_jour').length,
    aIgnorer: lignes.filter((l) => l.action === 'ignorer').length,
    conflits: lignes.filter((l) => l.action === 'conflit').length,
    produitsInconnus: [...rayonsVus].filter(
      (nom) => !rayons.some((r) => r.nom.toLowerCase() === nom.toLowerCase() || r.id === nom),
    ),
  }
}

/* ---------- 3. L'application ---------- */

export async function appliquerImport(
  simulation: Simulation,
  mode: ModeImport,
  auteurId: string,
): Promise<{ crees: number; misAJour: number; mouvements: number }> {
  const rayons = await base.rayons.toArray()
  const zones = await base.zones.toArray()
  const emplacements = await base.emplacements.toArray()
  const parNomZone = new Map(zones.map((z) => [z.nom.toLowerCase(), z]))
  const parCodeEmplacement = new Map(emplacements.map((e) => [e.code, e]))

  let crees = 0
  let misAJour = 0
  let mouvements = 0

  for (const ligne of simulation.lignes) {
    if (ligne.action === 'ignorer' || ligne.action === 'conflit') continue

    const rayon = rayons.find(
      (r) => r.nom.toLowerCase() === ligne.valeurs.rayon?.toLowerCase() || r.id === ligne.valeurs.rayon,
    ) ?? rayons[0]

    const zoneNom = ligne.valeurs.zone?.toLowerCase()
    const zone = zoneNom ? parNomZone.get(zoneNom) : undefined
    const cible = ligne.valeurs.emplacement ? parCodeEmplacement.get(ligne.valeurs.emplacement) : undefined

    const produit = ligne.existantId
      ? await produits.parId(ligne.existantId)
      : undefined

    const nouveau: ProduitRow = {
      id: produit?.id ?? nouvelId(),
      rayonId: produit?.rayonId ?? rayon.id,
      categorieId: produit?.categorieId ?? 'c-defaut',
      nomFr: ligne.valeurs.nom_fr ?? produit?.nomFr ?? 'Sans nom',
      nomEn: ligne.valeurs.nom_en ?? produit?.nomEn,
      codeBarres: ligne.valeurs.code_barres ?? produit?.codeBarres,
      unite: (ligne.valeurs.unite as ProduitRow['unite']) ?? produit?.unite ?? 'boite',
      seuil: Number(ligne.valeurs.seuil ?? produit?.seuil ?? 5) || 5,
      emplacementId: cible?.id ?? produit?.emplacementId,
      actif: true,
      paysOrigine: produit?.paysOrigine,
      dci: produit?.dci,
    }

    await produits.enregistrer(nouveau)
    if (produit) misAJour++
    else crees++

    /* Le mode STOCK passe par le journal, comme toute ecriture. */
    if (mode === 'stock' && ligne.valeurs.quantite !== undefined) {
      const quantite = Math.floor(Number(ligne.valeurs.quantite.replace(',', '.')) || 0)
      if (quantite > 0) {
        const lotExistant: Lot | undefined = ligne.valeurs.lot
          ? (await base.lots.where('produitId').equals(nouveau.id).filter((l) => l.numero === ligne.valeurs.lot).first())
          : undefined

        const lot: LotRow = lotExistant ?? {
          id: nouvelId(),
          produitId: nouveau.id,
          numero: ligne.valeurs.lot,
          peremption: ligne.valeurs.peremption,
          quantite: 0,
          emplacementId: cible?.id ?? zone?.id ?? 'attente-quai',
        }
        if (peremption(ligne)) lot.peremption = peremption(ligne)

        if (!lotExistant) await base.lots.add(lot)

        await base.mouvements.add({
          id: nouvelId(),
          type: 'reception',
          rayonId: nouveau.rayonId,
          produitId: nouveau.id,
          lotId: lot.id,
          quantite,
          versEmplacementId: lot.emplacementId,
          motif: 'import_fichier',
          auteurId,
          date: maintenant(),
          synchro: 0,
        })
        mouvements++
      }
    }
  }

  return { crees, misAJour, mouvements }
}

function peremption(ligne: LigneLue): string | undefined {
  return ligne.valeurs.peremption
}

/* ---------- 4. L'export ---------- */

export async function exporterProduits(format: 'csv' | 'xlsx', rayonId: string): Promise<{ nom: string; donnees: Uint8Array }> {
  const rayon = await base.rayons.get(rayonId)
  const liste = await produits.duRayon(rayonId)
  const lots = await base.lots.toArray()
  const mouvements = await base.mouvements.where('rayonId').equals(rayonId).toArray()
  const emplacements = await base.emplacements.toArray()
  const parCode = new Map(emplacements.map((e) => [e.id, e.code]))

  const lignes = liste
    .sort((a, b) => a.nomFr.localeCompare(b.nomFr))
    .map((p) => {
      const mesLots = lots.filter((l) => l.produitId === p.id)
      const stock = mouvements
        .filter((m) => m.produitId === p.id)
        .reduce((s, m) => s + m.quantite * (m.type === 'reception' ? 1 : m.type === 'transfert' ? 0 : -1), 0)
      const premier = mesLots.find((l) => l.peremption)

      return [
        rayon?.nom ?? '', '', p.nomFr, p.nomEn ?? '', p.codeBarres ?? '',
        p.unite, String(p.seuil), String(stock),
        premier?.numero ?? '', premier?.peremption ?? '',
        '', '', p.emplacementId ? (parCode.get(p.emplacementId) ?? '') : '',
      ]
    })

  const nomFichier = `gestmalin-${new Date().toISOString().slice(0, 10)}`

  if (format === 'xlsx') {
    return { nom: `${nomFichier}.xlsx`, donnees: ecrireXLSX([...COLONNES], lignes) }
  }
  return {
    nom: `${nomFichier}.csv`,
    donnees: new TextEncoder().encode(ecrireCSV([...COLONNES], lignes)),
  }
}