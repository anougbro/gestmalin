/* ============================================================
        GESTMALIN — Le vocabulaire du domaine
    Ce fichier ne contient QUE des formes de données.
        Aucun calcul, aucune logique. Rien ne s'exécute ici.
   ============================================================ */

/* ---------- Identifiants ----------
   Un identifiant est toujours du texte.
   On lui donne un nom pour que le code soit lisible. 
*/
export type IdRayon = string
export type IdZone = string
export type IdEmplacement = string
export type IdProduit = string
export type IdLot = string
export type IdMouvement = string
export type IdCategorie = string


/* ---------- Le rayon : le grand tiroir ----------
   Medicaments ou Produits menagers.
   Nomenclature : N appartient qu'au stock. 
*/
export type Rayon = {
  id: IdRayon
  nom: string
}


/* ---------- La zone : un espace reel ----------
   type ne peut prendre que ces cinq valeurs. 
*/
export type Zone = {
  id: IdZone
  rayonId: IdRayon
  nom: string
  type:
    | 'reserve_seche'
    | 'reserve_froide'
    | 'vitrine'
    | 'quarantaine'
    | 'rebut'
}


/* ---------- L'emplacement : la position precise ----------
   Le code est ce qu'on imprime sur l'etagere. Ex : "A2-04" 
*/
export type Emplacement = {
  id: IdEmplacement
  zoneId: IdZone
  code: string
  ordre: number
}


/* ---------- L'unite de vente ----------
   Le caractere "?" rend le champ facultatif. 
*/
export type Unite = 'boite' | 'plaquette' | 'sachet' | 'piece' | 'litre'


/* ---------- La categorie : gerable dans l'application ----------
   Liste fermee cote application, ouverte cote donnees.
   On peut en creer et en supprimer sans toucher au code.
   On ne peut pas en supprimer une qui sert encore. */
export type Categorie = {
  id: IdCategorie
  rayonId: IdRayon
  nom: string
  icone: string
}


/* ---------- Le produit : la reference ----------
   Ce qui est commun a tout.
   Les champs medicamenteux viendront plus tard. 
*/
export type Produit = {
  id: IdProduit
  rayonId: IdRayon
  categorieId: IdCategorie
  nomFr: string
  nomEn?: string
  codeBarres?: string
  unite: Unite
  seuil: number
  emplacementId?: IdEmplacement
  actif: boolean
}



/* ---------- Le lot : la boite reelle en stock ----------
   C'est le lot qui porte la quantite et la peremption,
   pas le produit. 
*/
export type Lot = {
  id: IdLot
  produitId: IdProduit
  numero?: string
  peremption?: string
  originePays?: string
  quantite: number
  emplacementId: IdEmplacement
}

/* ============================================================
   LE MOUVEMENT — la seule chose qui s'ecrit jamais
   ============================================================

   Regle absolue : un mouvement ne se modifie pas, ne se
   supprime pas. On ne fait que l'AJOUTER.

   Si tu te trompes en saisissant une sortie de 3 boites
   au lieu de 8, on n'efface rien : on ajoute un mouvement
   'correction' qui pointe vers le mouvement fautif.
   Le fautif reste visible, avec sa vraie date.

   C'est ce qui rend la tracabilite credible face a un
   controle. Et c'est ce qui permet de synchroniser deux
   telephones sans jamais arbitrer. 
*/

export type TypeMouvement =
  | 'reception'
  | 'sortie'
  | 'transfert'
  | 'perte'

export type Mouvement = {
  id: IdMouvement
  type: TypeMouvement
  rayonId: IdRayon
  produitId: IdProduit
  lotId?: IdLot

  /* 
     Toujours POSITIVE. Le sens vient de `type`, jamais du signe.
     Une sortie de 3 est { type: 'sortie', quantite: 3 }. 
  */
  quantite: number

  /* 
     Origine et destination.
     reception  : vers seulement
     sortie     : depuis seulement
     transfert  : les deux
     correction : selon le cas 
  */
  depuisEmplacementId?: IdEmplacement
  versEmplacementId?: IdEmplacement

  /* 
  Obligatoire sur sortie, perte et correction. 
  */
  motif?: string

  /* 
  Pointe vers le mouvement que celui-ci vient corriger. 
  */
  corrigeMouvementId?: IdMouvement

  auteurId: string

  /* 
  Format ISO : 'AAAA-MM-JJTHH:MM:SSZ'. 
  */
  date: string
}