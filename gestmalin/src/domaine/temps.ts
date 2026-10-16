/* ============================================================
   LE TEMPS

   Piege : l'horloge d'un telephone peut se mettre a l'arriere.
   Un telephone sans reseau depuis trois jours peut se poser sur
   un reseau avec une date erronee, ou l'utilisateur peut
   simplement se tromper de heure.

   Consequence si on ne fait rien : des lots perimes depuis trois
   jours redeviennent "valides" et l'application oublie une alerte.

   Regle : on garde TOUJOURS la date la plus avancee jamais vue.
   L'horloge peut avancer tout seul, jamais reculer.
   ============================================================ */

let derniereDateVue = 0

export function maintenantISO(): string {
  const maintenant = Date.now()

  if (maintenant < derniereDateVue) {
    /* L'horloge a recule. On refuse et on garde l'ancienne valeur. */
    return new Date(derniereDateVue).toISOString()
  }

  derniereDateVue = maintenant
  return new Date(maintenant).toISOString()
}

/** Aujourd'hui au format court 'AAAA-MM-JJ', pour comparer aux dates de peremption. */
export function aujourdhui(): string {
  return maintenantISO().slice(0, 10)
}

/** Nombre de jours entiers avant une date. Negatif si la date est passee. */
export function joursAvant(dateISO: string, reference = aujourdhui()): number {
  const cible = Date.parse(`${dateISO.slice(0, 10)}T00:00:00Z`)
  const base = Date.parse(`${reference.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(cible) || Number.isNaN(base)) return 0
  return Math.round((cible - base) / 86_400_000)
}

/** Remet le compteur a zero. Reserve aux tests. */
export function reinitialiserTemps(): void {
  derniereDateVue = 0
}