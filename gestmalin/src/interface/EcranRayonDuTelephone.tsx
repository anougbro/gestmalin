import { useState } from 'react'
import { rattacherTelephone } from '../donnees/reglages'
import { RAYONS_PAR_DEFAUT } from '../etat/rayons'
import { Icone } from './Icones'

/* ============================================================
   QUE GERES-TU ?

   La premiere question de l'application, posee une seule fois par
   telephone.

   Elle n'existait pas parce qu'on croyait qu'un telephone gerait
   les deux rayons. C'est faux des la premiere installation reelle
   : la pharmacie a son telephone, la personne qui gere les produits
   menagers a le sien.

   Sans cette question, le compte cree au premier lancement se voit
   attribuer les deux rayons, et la personne des menagers peut
   ranger du savon sous « Medicaments » — ou l'apothicaire ne le
   verra jamais. Elle ne saura meme pas que ca s est passe.

   La question tient en deux gros boutons, un mot chacun, une
   icone. Elle est posee AVANT le code : demander un code a
   quelqu'un dont on ne sait pas encore sur quoi il travaille ne
   sert a rien.
   ============================================================ */

export function EcranRayonDuTelephone({ surChoix }: { surChoix: () => void }) {
  const [enregistrement, setEnregistrement] = useState<string | null>(null)

  async function choisir(rayonId: string) {
    setEnregistrement(rayonId)
    await rattacherTelephone(rayonId)
    surChoix()
  }

  return (
    <div className="ecran">
      <div className="contenu">
        <div className="carte" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em' }}>
            Que gères-tu ?
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--c-500)' }}>
            Ce téléphone ne verra que ça.
          </p>
        </div>

        <div className="liste">
          {RAYONS_PAR_DEFAUT.map((r) => (
            <button
              key={r.id}
              className="ligne"
              style={{ minHeight: 72 }}
              disabled={enregistrement !== null}
              onClick={() => void choisir(r.id)}
            >
              <span className="destination" style={{ background: r.ton === 'teal' ? 'var(--teal-700)' : 'var(--c-300)' }}>
                <Icone nom={r.ton === 'teal' ? 'capsule' : 'maison'} taille={22} />
              </span>
              <span className="ligne__corps">
                <span className="ligne__titre">{r.nom}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}