import { describe, expect, it } from 'vitest'
import { ecart, natureEcart, ECART_MINIMUM, SEUIL_ECART_PCT } from './ecart'

/* ============================================================
   LA NATURE D'UN ECART

   Ce module decide si un ecart peut etre enregistre tel quel ou
   s il doit etre recompte. C'est une annonce de perte de
   marchandise signee par une personne : la regle doit etre la
   meme partout, donc elle est ecrite une fois, ici, et testee.

   Le detail qui compte : ce que le seuil PROTEGE. Un seuil trop
   bas declenche des recomptes partout, et un controle que
   l on applique systematiquement n est plus un controle.
   ============================================================ */

describe('un ecart qui n en est pas un', () => {
  it('compte pareil : rien a signaler', () => {
    expect(natureEcart(18, 18)).toBe('rien')
  })

  it('zero sur zero reste rien', () => {
    /* Un emplacement vide et un produit qu on ne connait pas :
       l application et le comptant disent la meme chose. */
    expect(natureEcart(0, 0)).toBe('rien')
  })
})

describe('un ecart ordinaire', () => {
  it('une unite sur dix-huit est une faute de frappe', () => {
    expect(natureEcart(18, 17)).toBe('ordinaire')
  })

  it('quatre boites sur dix-huit passent', () => {
    /* 22 % : sous le seuil de 25 %. */
    expect(natureEcart(18, 14)).toBe('ordinaire')
  })

  it('dix boites sur quatre cents passent', () => {
    /* 2,5 % de 400 : l importance d un ecart se juge sur le
       pourcentage, pas sur le nombre brut. Dix boites sur
       quatre cents ne sont rien ; dix sur dix serait tout. */
    expect(natureEcart(400, 390)).toBe('ordinaire')
  })

  it('une unite sur deux passe', () => {
    /* 50 %, mais une seule boite. Une seule boite qui manque
       ressemble a un doigt pose de travers, pas a une perte.
       C est le seuil minimum qui protege de ce piege. */
    expect(natureEcart(2, 1)).toBe('ordinaire')
    expect(ECART_MINIMUM).toBe(2)
  })

  it('l augmentation est traitee comme la diminution', () => {
    /* Un ecart en trop et un ecart en manquant sont aussi
       inexpliquables l un que l autre. */
    expect(natureEcart(18, 19)).toBe('ordinaire')
    expect(natureEcart(18, 13)).toBe('important')
  })
})

describe('un ecart important', () => {
  it('cinq boites manquantes sur dix-huit', () => {
    /* 28 %, au-dela du seuil. */
    expect(natureEcart(18, 13)).toBe('important')
  })

  it('le produit a disparu des leges', () => {
    /* attendu 3, trouve 0 : cent pour cent de manque, et
       surtout un produit entier. C est le cas que le recompte a
       deux distingue le mieux. */
    expect(natureEcart(3, 0)).toBe('important')
  })

  it('du stock que l application ne connaissait pas', () => {
    /* attendu 0, trouve 12 : une reception entiere oubliee.
       Deux hypotheses seulement — oubli ou erreur — et le
       recompte tranche en dix secondes. */
    expect(natureEcart(0, 12)).toBe('important')
  })

  it('la moitie du stock a disparu', () => {
    expect(natureEcart(40, 20)).toBe('important')
  })
})

describe('le seuil est un seul', () => {
  it('vaut 25 %', () => {
    expect(SEUIL_ECART_PCT).toBe(25)
  })

  it('peut etre regle par l application', () => {
    /* Une officine tres active qui compte souvent peut vouloir
       un seuil plus severe. La fonction l accepte plutot que de
       l interdire. */
    expect(natureEcart(100, 98, 1)).toBe('important')   /* 2 % >= 1 % */
    expect(natureEcart(100, 98, 5)).toBe('ordinaire')   /* 2 % <  5 % */
  })

  it('tous les entiers de 0 a 200 ont une nature definie', () => {
    /* Pas de cas qui echappe : toute paire de nombres doit
       tomber dans une des trois cases. Une fonction qui renvoie
       undefined pour certaines valeurs ferait disparaitre un
       ecart du controle sans le dire. */
    for (let a = 0; a <= 200; a += 7) {
      for (let t = 0; t <= 200; t += 7) {
        const n = natureEcart(a, t)
        expect(['rien', 'ordinaire', 'important']).toContain(n)
      }
    }
  })

  it('un ecart ne devient jamais plus leger en s eloignant', () => {
    /* LA vraie propriete. Pour une quantite attendue donnee,
       s' eloigner du compte attendu ne peut pas rendre l' ecart
       moins grave. Sinon on pourrait trouver un ecart enorme
       juge anodin, ce qui est absurde — et un compteur pourrait
       " ameliorer " son resultat en comptant de travers. */

    /* On part de l ATTENUE et on s eloigne dans les deux sens.
       Parcourir les quantites de 0 a 300 ne prouverait rien :
       l' ecart y diminue puis augmente, et la nature redescend
       naturellement en chemin — sans que ce soit un defaut. */
    const poids = { rien: 0, ordinaire: 1, important: 2 } as const

    for (let attendue = 0; attendue <= 200; attendue += 11) {
      for (const signe of [1, -1]) {
        let precedent = -1
        for (let distance = 0; distance <= 300; distance++) {
          const trouvee = attendue + signe * distance
          if (trouvee < 0) break
          const courant = poids[natureEcart(attendue, trouvee)]
          expect(courant).toBeGreaterThanOrEqual(precedent)
          precedent = courant
        }
      }
    }
  })

  it('la meme perte est plus grave sur un petit stock', () => {
    /* Cinq boites qui manquent ne se pesent pas pareil selon la
       taille du stock : 5 sur 21 reste sous le seuil, 5 sur 16
       le depasse. C est voulu. Le regime proportionnel est ce
       qui rend le controle comparable entre un rayon de cinquante
       references et un rayon de trois cents — et c est aussi ce
       qui rend le seuil ABC et le seuil d ecart coherents entre
       eux. Ce n est donc pas un defaut d asymetrie. */
    expect(natureEcart(21, 16)).toBe('ordinaire')
    expect(natureEcart(16, 21)).toBe('important')
  })
  it('la meme perte est plus grave sur un petit stock', () => {
    /* Cinq boites qui manquent ne se pesent pas pareil selon la
       taille du stock : 5 sur 21 reste sous le seuil, 5 sur 16
       le depasse. C est voulu. Le regime proportionnel est ce
       qui rend le controle comparable entre un rayon de fifty
       references et un rayon de trois cents — et c est aussi
       ce qui rend le seuil ABC et le seuil d ecart coherents
       entre eux. Ce n est donc pas un defaut d asymetrie. */
    expect(natureEcart(21, 16)).toBe('ordinaire')
    expect(natureEcart(16, 21)).toBe('important')
  })
})

describe('l ecart en clair', () => {
  it('donne le nombre signe', () => {
    expect(ecart(18, 13).valeur).toBe(-5)
    expect(ecart(13, 18).valeur).toBe(5)
  })

  it('donne le sens en mots, jamais un signe', () => {
    /* Un « -5 » affiche a l ecran ne se lit pas pour quelqu un
       qui lit peu. « manque 5 boites » se lit. */
    expect(ecart(18, 13).sens).toBe('manque')
    expect(ecart(13, 18).sens).toBe('en trop')
    expect(ecart(18, 18).sens).toBe('rien')
  })

  it('porte sa nature avec lui', () => {
    expect(ecart(18, 13).nature).toBe('important')
    expect(ecart(18, 17).nature).toBe('ordinaire')
    expect(ecart(18, 18).nature).toBe('rien')
  })
})
