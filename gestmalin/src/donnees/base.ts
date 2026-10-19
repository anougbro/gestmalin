import Dexie, { type Table } from 'dexie'
import type {
  Rayon, Zone, Emplacement, Produit, Lot, Mouvement, Categorie,
  Fournisseur, Inventaire, LigneInventaire,
  ReleveTemperature, DemandeApprobation, TypeMouvement,
} from '../domaine/types'
import type { Utilisateur, Role } from '../domaine/acces'

/* ============================================================
   LA BASE LOCALE — IndexedDB, via Dexie

   Regle absolue du projet : le STOCK n'est pas ici.
   Ce qui est ici, ce sont les EVENEMENTS et les REFERENTIELS.
   Le stock se recalcule a la lecture, jamais il ne se memorise.
   ============================================================ */

export type TypeZone =
  | 'reserve_seche' | 'reserve_froide' | 'vitrine' | 'quarantaine' | 'rebut'


export type StatutInventaire = 'en_cours' | 'valide'
export type StatutDemande = 'en_attente' | 'approuvee' | 'refusee'

export type RayonRow = Rayon & { ordre: number }

export type FournisseurRow = Fournisseur & { actif: boolean }

export type ProduitRow = Produit & {
  /* Champs medicamenteux : laisses VIDES quand ils n'ont pas
     de sens. Une lessive n'a pas de DCI. */
  dci?: string
  forme?: string
  dosage?: string
  laboratoire?: string
  paysOrigine?: string
  fournisseurId?: string
}

export type LotRow = Lot & { numeroSerie?: string }

/* `synchro` est 0 ou 1, PAS un booleen : c'est un marqueur
   technique destine a etre indexe, et IndexedDB n'indexe pas
   les booleens. Le jour ou le serveur existera, 0 = a envoyer. */
export type MouvementRow = Mouvement & { synchro: 0 | 1 }

export type InventaireRow = Inventaire & { auteurId: string }

export type LigneInventaireRow = LigneInventaire & {
  /* Colonne VOLONTAIREMENT absente : l'attendu n'est pas stocke
     pendant le comptage, il est CALCULE au moment de l'affichage.
     C'est ce qui rend le comptage impartial. */
  badgeABC: 'A' | 'B' | 'C'
  recompte: boolean
}

/* Le type de la personne vient du domaine : une seule definition,
   sinon la base et le code parleraient de deux personnes differentes. */
export type UtilisateurRow = Utilisateur
export type { Role }

/* ---------- Un reglage de ce telephone ----------

   Le telephone a porte UN rayon, choisi a sa premiere ouverture.
   Ce n'est plus le modele : un seul telephone sert les deux
   rayons, et c'est le compte qui decide de ce qu'on voit. Le type
   reste parce que la migration 3 l'a ecrit en base, et qu'une
   migration decrit un passe qu'on ne reecrit pas. */

export type Reglage = {
  cle: string
  rayon?: string
}

export type ReleveTemperatureRow = ReleveTemperature

export type DemandeApprobationRow = DemandeApprobation & {
  type: 'quarantaine' | 'releve_hors_plage' | 'reapprovisionnement'
  statut: StatutDemande
  demandeurId: string
  approbateurId?: string
  mandatId?: string
}

/* ---------- DECLARATION DES TABLES ----------

   On utilise le mot-cle `declare`, PAS le `!`.

   Avec `rayons!: Table<...>`, TypeScript modern (ES2022) cree
   reellement la propriete avec la valeur `undefined` au moment
   de la construction de l'objet — c'est-a-dire APRES que Dexie
   l'a remplie. Le `!` est donc efface et la table devient
   undefined.

   `declare` dit a TypeScript : « c'est une simple declaration
   de type, n'emets aucun code ». C'est la seule forme qui
   fonctionne avec Dexie en TypeScript strict. */

class BaseGestmalin extends Dexie {
  declare rayons: Table<RayonRow, string>
  declare zones: Table<Zone & { type: TypeZone }, string>
  declare emplacements: Table<Emplacement, string>
  declare categories: Table<Categorie, string>
  declare fournisseurs: Table<FournisseurRow, string>
  declare produits: Table<ProduitRow, string>
  declare lots: Table<LotRow, string>
  declare mouvements: Table<MouvementRow, string>
  declare inventaires: Table<InventaireRow, string>
  declare lignesInventaire: Table<LigneInventaireRow, string>
  declare utilisateurs: Table<UtilisateurRow, string>
  declare relevesTemperature: Table<ReleveTemperatureRow, string>
  declare demandesApprobation: Table<DemandeApprobationRow, string>

  /* ---------- Les reglages de CE telephone ----------

     La table a existe : elle portait le rayon du telephone, quand
     un telephone ne servait qu'un rayon. Elle est supprimee par la
     migration 4.

     La declaration reste pour que la migration 3 — qui l'a creee —
     reste lisible, et parce que Dexie a besoin du nom pour la
     retirer. Aucun code ne doit plus y ecrire. */
  declare reglages: Table<Reglage, string>

  constructor() {
    super('gestmalin')

    /* Les index sont les portes de la base. Une base sans index
       oblige a tout lire pour trouver une ligne : c'est lent et
       ça consomme la batterie.

       ATTENTION — `actif` n'est PAS indexe. IndexedDB n'accepte
       que des cles de type nombre, texte ou date : un booleen
       (`true`/`false`) n'est pas une cle valide et l'index serait
       silencieusement vide. On indexe donc le rayon seulement, et
       on filtre sur `actif` en memoire. Avec quelques milliers
       de produits, le filtrage est instantane. */
    this.version(1).stores({
      rayons: 'id, nom, ordre',
      zones: 'id, rayonId, type',
      emplacements: 'id, zoneId, code, [zoneId+ordre]',
      categories: 'id, rayonId, nom',
      fournisseurs: 'id, rayonId, nom',
      produits: 'id, rayonId, categorieId, codeBarres, nomFr, fournisseurId, [rayonId+nomFr]',
      lots: 'id, produitId, peremption, [produitId+peremption]',
      mouvements: 'id, produitId, lotId, rayonId, type, date, auteurId, synchro, [produitId+date], [lotId+date], [rayonId+date]',
      inventaires: 'id, zoneId, statut, date',
      lignesInventaire: 'id, inventaireId, produitId, [inventaireId+produitId]',
      utilisateurs: 'id, nom, role',
      relevesTemperature: 'id, zoneId, date',
      demandesApprobation: 'id, statut, date, type, [statut+date]',
    })

    /* ---------- Migration 2 : l'empreinte du code ----------
       La version 1 stockait la personne SANS empreinte de code.
       Sans migration, une base deja creee garde des personnes sans
       empreinte : la comparaison du code echoue toujours et
       personne ne peut plus jamais se connecter.

       C'est exactement le piege des migrations : changer la forme
       d'une donnee sans dire quoi faire de l'ancienne. */
    this.version(2)
      .stores({
        rayons: 'id, nom, ordre',
        zones: 'id, rayonId, type',
        emplacements: 'id, zoneId, code, [zoneId+ordre]',
        categories: 'id, rayonId, nom',
        fournisseurs: 'id, rayonId, nom',
        produits: 'id, rayonId, categorieId, codeBarres, nomFr, fournisseurId, [rayonId+nomFr]',
        lots: 'id, produitId, peremption, [produitId+peremption]',
        mouvements: 'id, produitId, lotId, rayonId, type, date, auteurId, synchro, [produitId+date], [lotId+date], [rayonId+date]',
        inventaires: 'id, zoneId, statut, date',
        lignesInventaire: 'id, inventaireId, produitId, [inventaireId+produitId]',
        utilisateurs: 'id, nom, role',
        relevesTemperature: 'id, zoneId, date',
        demandesApprobation: 'id, statut, date, type, [statut+date]',
      })
      .upgrade(async (tx) => {
        await tx.table('utilisateurs').toCollection().modify((u: Record<string, unknown>) => {
          /* On ne peut pas recreer une empreinte depuis un code
             qu'on n'a jamais eu. La seule issue honnete est de
             remettre le code du tout premier compte a sa valeur
             de depart, et de le dire a l'utilisateur. */
          if (!u.empreinte) u.codeARepartir = true
        })
      })

    /* ---------- Migration 3 : les reglages du telephone ----------

       Nouvelle table, aucun contenu a reconvertir. Dexie la cree
       vide. Le fait de ne pas y mettre de valeur est ce qui fera
       poser la question « que gères-tu ? » au prochain lancement.

       C'est le comportement voulu : une base deja installee mais
       jamais rattachee doit poser la question, et une base
       rattachee ne doit surtout pas la poser une seconde fois. */
    this.version(3)
      .stores({
        rayons: 'id, nom, ordre',
        zones: 'id, rayonId, type',
        emplacements: 'id, zoneId, code, [zoneId+ordre]',
        categories: 'id, rayonId, nom',
        fournisseurs: 'id, rayonId, nom',
        produits: 'id, rayonId, categorieId, codeBarres, nomFr, fournisseurId, [rayonId+nomFr]',
        lots: 'id, produitId, peremption, [produitId+peremption]',
        mouvements: 'id, produitId, lotId, rayonId, type, date, auteurId, synchro, [produitId+date], [lotId+date], [rayonId+date]',
        inventaires: 'id, zoneId, statut, date',
        lignesInventaire: 'id, inventaireId, produitId, [inventaireId+produitId]',
        utilisateurs: 'id, nom, role',
        relevesTemperature: 'id, zoneId, date',
        demandesApprobation: 'id, statut, date, type, [statut+date]',
        reglages: 'cle',
      })

    /* ---------- Migration 4 : le telephone n'est plus rattache ----------

       Le telephone portait UN rayon, choisi a la premiere ouverture.
       Ce n'est plus le modele : un seul telephone sert les deux
       rayons, et c'est le COMPTE qui decide de ce qu'on voit.

       On supprime donc la table. La laisser vide serait pire que de
       la retirer : quelqu'un la relirait un jour en croyant qu'elle
       sert encore, et rebatirait une regle qu'on vient d'enlever.

       Rien n'est perdu : la seule chose qu'elle contenait est
       precisement ce qu'on ne veut plus. */
    this.version(4)
      .stores({ reglages: null })
  }
}

export const base = new BaseGestmalin()

/* ---------- Le quai de reception ----------
   Tout ce qui arrive passe par la avant d'etre pose en rayon.
   C'est ce qui rend l'ecran Ranger utile : on voit ce qui attend,
   avec sa destination. Ce n'est pas une vraie etagere, donc
   elle n'appartient a aucune zone. */
export const ATTENTE_ID = 'attente-quai'

/* ---------- Les types de mouvement, reutilises ---------- */
export const TOUS_LES_TYPES: TypeMouvement[] = ['reception', 'sortie', 'transfert', 'perte']