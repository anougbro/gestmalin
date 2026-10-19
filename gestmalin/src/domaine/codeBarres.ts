/* ============================================================
   LA LECTURE D'UN CODE-BARRES

   Ce fichier ne contient QUE du calcul : aucune camera, aucun
   navigateur, aucune base. C'est ce qui permet de le tester en
   trois lignes au lieu de simuler un telephone entier.

   La camera vit dans `interface/Scan.ts`. Le noyau decide, l'ecran
   montre — ici, decouper un code.

   Trois bugs ont traverse cette logique sans qu'aucun test ne les
   voie, parce qu'il n'y avait aucun test :

   1. Un EAN-13 tout simple — le format le plus courant sur une
      boite de medicament — ne produisait AUCUN code produit. La
      reception repondait « Code inconnu » et n'ajoutait rien.
      C'est exactement ce que le scan a fait sur telephone.

   2. Le decoupage GS1 mangeait le dernier caractere de chaque
      valeur : GTIN sans son dernier chiffre, peremption
      2027-03-3 au lieu de 2027-03-31, lot sans sa derniere
      lettre. Trois informations faussees en silence.

   3. Le siecle etait inverse : 27 devenait 1927.

   Un scan qui lit faux est plus dangereux qu'un scan qui echoue :
   la boite est enregistree avec une peremption fausse, et
   personne ne le voit.
   ============================================================ */

export type CodeLu = {
  brut: string
  gtin?: string
  lot?: string
  peremption?: string
  serie?: string
}

/* ---------- Ce qu'un code peut contenir ----------

   (01) GTIN        le produit
   (10) lot         le numero de lot
   (17) peremption  la date, en AAMMJJ
   (21) serie       le numero unique de la boite

   C'est ce qui permet de remplir quatre champs d'un seul scan. */

export function analyserGS1(brut: string): CodeLu {
  const code: CodeLu = { brut }

  /* ---------- 1. Un code tout en chiffres, sans parenthese ----------

     C'est le format le plus courant sur une boite de medicament :
     un EAN-13 imprime, rien de plus. Le decoupage par parentheses
     ne trouve rien, et le produit n'est jamais cherche — la
     reception affiche « Code inconnu » alors que le code est
     parfaitement lisible.

     On retire les espaces et separateurs : certains lecteurs
     rendent « 3 400930 123456 ». */
  const chiffres = brut.replace(/[\s-]/g, '')
  if (LONGUEUR_PLAUSIBLE(chiffres)) {
    code.gtin = chiffres
    return code
  }

  /* ---------- 2. Le format GS1 element-string ----------

     (01)3400930123456(17)270331(10)A2X9F

     La cle occupe les caracteres 1 a 3 — les parenthesees
     comprises. La valeur commence a l'INDICE 4.

     Et s'arrete a la FIN du bloc trouve, pas un caractere avant :
     l'expression reguliere ne capture pas la parenthese
     fermante — `[^(]*` s'arrete devant la prochaine ouvrante.
     Un `slice(4, -1)` mange donc le dernier chiffre de chaque
     valeur. */
  const elements = brut.match(/\((\d{2,4})\)([^(]*)/g)
  if (!elements) return code

  for (const element of elements) {
    const cle = element.slice(1, 3)
    const valeur = element.slice(4).trim()
    switch (cle) {
      case '01': code.gtin = valeur; break
      case '10': code.lot = valeur; break
      case '17': code.peremption = convertirDateGS1(valeur); break
      case '21': code.serie = valeur; break
    }
  }
  return code
}

/* GS1 utilise AAMMJJ. On rend 'AAAA-MM-JJ', le format qu'on
   stocke partout ailleurs. */
export function convertirDateGS1(aammjj: string): string {
  /* Certains DataMatrix encodent la date complete sur 8 chiffres.
     Appliquer AAMMJJ a « 20270331 » donnerait « 2072-03-31 »,
     une date fausse, sans le moindre avertissement. */
  if (/^\d{8}$/.test(aammjj)) {
    return `${aammjj.slice(0, 4)}-${aammjj.slice(4, 6)}-${aammjj.slice(6, 8)}`
  }

  const annee = aammjj.slice(0, 2)

  /* Le siecle : une medicine qui expire en 98 doit expirer en
     1998, pas en 2098. Sinon elle sera jugee encore valable
     pendant soixante-douze ans.

     On ne peut pas deviner le siecle avec certitude. La regle
     retenue couvre jusqu'en 2049 : de 00 a 49 on est en 2000,
     de 50 a 99 on est en 1900. Au-dela, il faudra repenser le
     decoupage — c'est note ici pour que ce ne soit pas une
     surprise dans vingt-trois ans.

     L'ordre de la comparaison compte : c'est 50 et au-dessus
     qui sont 19xx, pas l'inverse. Ecrire le test a l'envers
     transformait 27 en 1927, soit une medicine perimee depuis
     un siecle jugee encore valable. */
  const siecle = Number(annee) >= 50 ? '19' : '20'
  return `${siecle}${annee}-${aammjj.slice(2, 4)}-${aammjj.slice(4, 6)}`
}

/* Une longueur de code plausible : 8, 12, 13 ou 14 chiffres.

   C'est ce qui permet de distinguer deux problemes qu'on
   confondait : « ce code n existe pas dans la base » se regle en
   creant le produit, « ce que j'ai lu n'est pas un code » ne se
   regle pas du tout. Un code de 19 chiffres — un GS1-128 dont le
   lecteur a perdu les separateurs — n'entre dans aucune de ces
   cases : on ne devine pas ou commence le produit. */
export function LONGUEUR_PLAUSIBLE(gtin: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(gtin)
}