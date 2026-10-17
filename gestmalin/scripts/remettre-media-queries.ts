import { readFileSync, writeFileSync } from 'node:fs'

/* ============================================================
   REMETTRE LES MEDIA QUERIES A LA FIN

   Les media queries doivent etre les dernieres regles du
   fichier. Une regle ecrite apres un @media gagne sur lui, a
   specs egales : on croit avoir style pour l'ordinateur, et le
   telephone passe devant.

   Ce script les extrait et les replace a la fin, sans toucher
   au reste. Il refuse de s'executer si le compte ne correspond
   pas — mieux vaut ne rien faire que casser la feuille de style.
   ============================================================ */

const chemin = process.argv[2]
const css = readFileSync(chemin, 'utf8')

type Bloc = { debut: number; fin: number; texte: string }

function trouverMedia(source: string): Bloc[] {
  const blocs: Bloc[] = []
  /* On exige que @media commence une ligne. Sinon le mot ecrit
     dans un commentaire (« une regle apres un @media gagne ») est
     pris pour une reelle requete media, et le script decoupe le
     fichier au mauvais endroit. C'est deja arrive. */
  const re = /^[ \t]*@media[ \t]*[^{]*\{/gm
  let m: RegExpExecArray | null

  while ((m = re.exec(source)) !== null) {
    const debut = m.index
    const apresAccot = m.index + m[0].length
    let profondeur = 1
    let i = apresAccot

    while (i < source.length && profondeur > 0) {
      if (source[i] === '{') profondeur++
      else if (source[i] === '}') profondeur--
      i++
    }

    if (profondeur !== 0) {
      console.error(`Acc accolade non ferme pour le bloc commencant a la position ${debut}.`)
      process.exit(1)
    }

    blocs.push({ debut, fin: i, texte: source.slice(debut, i) })
    re.lastIndex = i
  }

  return blocs
}

const blocs = trouverMedia(css)
if (blocs.length === 0) {
  console.log('Aucun bloc @media : rien a faire.')
  process.exit(0)
}

/* On retire les blocs en marche arriere, pour que les positions
   des blocs suivants restent valides. */
let reste = css
for (let i = blocs.length - 1; i >= 0; i--) {
  reste = reste.slice(0, blocs[i].debut) + reste.slice(blocs[i].fin)
}

const propre = reste.replace(/\s+$/, '')
const sortie = `${propre}\n\n/* ============================================================\n   LES MEDIA QUERIES — EN DERNIER\n\n   Une regle ecrite apres un @media gagne sur lui. Ces blocs\n   doivent donc rester les derniers du fichier : deplace, un style\n   d'ordinateur disparait sans qu'on le voie.\n   ============================================================ */\n\n${blocs.map((b) => b.texte).join('\n\n')}\n`

writeFileSync(chemin, sortie, 'utf8')

for (const b of blocs) {
  const premiere = b.texte.split('\n')[0].trim()
  console.log(`  deplace : ${premiere}`)
}
console.log(`${blocs.length} bloc(s) @media remis a la fin.`)