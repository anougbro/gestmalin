import type { Mouvement } from './types'

/* ============================================================
   LA VERIFICATION — ce qu'un mouvement a le droit d'etre

   Un TYPE decrit une forme. Il ne peut pas interdire une
   combinaison de valeurs. Cette fonction, si.

   Exemple : le type autorise un transfert sans destination,
   parce que le champ est facultatif. Ici, on refuse.

   Elle ne leve jamais une erreur : elle REND une liste de
   problemes. C'est volontaire — l'interface peut alors montrer
   tous les soucis d'un coup, au lieu de les faire decouvrir
   un par un.
   ============================================================ */

export type Probleme = {
  champ: string
  message: string
}

const FORMAT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export function verifierMouvement(m: Mouvement): Probleme[] {
  const problemes: Probleme[] = []

  /* ---------- Champs communs ---------- */
  if (!m.id) problemes.push({ champ: 'id', message: "Le mouvement n'a pas d'identifiant." })
  if (!m.rayonId) problemes.push({ champ: 'rayonId', message: 'Le mouvement ne dit pas dans quel rayon il se passe.' })
  if (!m.produitId) problemes.push({ champ: 'produitId', message: 'Le mouvement ne dit pas de quel produit il parle.' })
  if (!m.auteurId) problemes.push({ champ: 'auteurId', message: 'Tout mouvement doit être signé.' })

  /* ---------- La date ----------
     On verifie le FORMAT, pas la verite. Impossible de savoir
     si l'horloge de l'appareil est bonne : on se contente de
     garantir qu'on peut trier et comparer. */
  if (!m.date) {
    problemes.push({ champ: 'date', message: "Le mouvement n'a pas de date." })
  } else if (!FORMAT_ISO.test(m.date)) {
    problemes.push({ champ: 'date', message: `Date illisible : « ${m.date} ». Format attendu : AAAA-MM-JJTHH:MM:SSZ.` })
  }

  /* ---------- La quantite ----------
     Toujours positive, jamais zero, jamais décimale. Une sortie
     de 3,5 boite n'existe pas. */
  if (!Number.isInteger(m.quantite)) {
    problemes.push({ champ: 'quantite', message: `La quantité « ${m.quantite} » n'est pas un nombre entier.` })
  } else if (m.quantite <= 0) {
    problemes.push({ champ: 'quantite', message: 'La quantité doit être supérieure à zéro. Le sens vient du type du mouvement.' })
  }

  /* ---------- Selon le type ---------- */
  switch (m.type) {
    case 'reception':
      if (!m.versEmplacementId) {
        problemes.push({ champ: 'versEmplacementId', message: 'Une réception doit dire où la marchandise est rangée.' })
      }
      if (m.depuisEmplacementId) {
        problemes.push({ champ: 'depuisEmplacementId', message: 'Une réception ne peut pas partir d\'un emplacement.' })
      }
      break

    case 'sortie':
    case 'perte':
      if (!m.depuisEmplacementId) {
        problemes.push({ champ: 'depuisEmplacementId', message: 'Une sortie doit dire d\'où la marchandise vient.' })
      }
      if (m.versEmplacementId) {
        problemes.push({ champ: 'versEmplacementId', message: 'Une sortie ne peut pas arriver quelque part : elle est consommée.' })
      }
      if (!m.motif) {
        problemes.push({ champ: 'motif', message: 'Une sortie doit dire pourquoi.' })
      }
      break

    case 'transfert':
      if (!m.depuisEmplacementId) {
        problemes.push({ champ: 'depuisEmplacementId', message: 'Un transfert doit dire d\'où la marchandise part.' })
      }
      if (!m.versEmplacementId) {
        problemes.push({ champ: 'versEmplacementId', message: 'Un transfert doit dire où la marchandise arrive.' })
      }
      if (m.depuisEmplacementId && m.depuisEmplacementId === m.versEmplacementId) {
        problemes.push({ champ: 'versEmplacementId', message: 'Un transfert ne peut pas aller au même endroit.' })
      }
      break
  }

  /* ---------- La boucle impossible ----------
     Un mouvement ne peut pas se corriger lui-même. */
  if (m.corrigeMouvementId && m.corrigeMouvementId === m.id) {
    problemes.push({ champ: 'corrigeMouvementId', message: 'Un mouvement ne peut pas se corriger lui-même.' })
  }

  return problemes
}

/* ---------- Deux raccourcis pour l'usage courant ---------- */

/** Le mouvement est-il acceptable ? */
export function estValide(m: Mouvement): boolean {
  return verifierMouvement(m).length === 0
}

/**
 * Lance une erreur si le mouvement est invalide.
 * À utiliser aux frontières : création depuis un formulaire,
 * import de fichier, lecture de la base.
 */
export function exigerMouvementValide(m: Mouvement): Mouvement {
  const problemes = verifierMouvement(m)
  if (problemes.length > 0) {
    const detail = problemes.map((p) => `${p.champ} : ${p.message}`).join('\n')
    throw new Error(`Mouvement refusé (${m.type})\n${detail}`)
  }
  return m
}