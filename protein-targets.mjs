const FR_NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const PROTEIN_KCAL_PER_GRAM = 4;
const CARB_KCAL_PER_GRAM = 4;
const FAT_KCAL_PER_GRAM = 9;
// Borne de répartition énergétique de l’AMDR adulte, utilisée pour le budget de l’app.
const MAX_PROTEIN_ENERGY_PERCENT = 35;

export function proteinPlan(profile, kcal, fatRange) {
  const { proteinMode, proteinPerKg, proteinGrams, weight, height, goalWeight } = profile;
  if (proteinMode == null || proteinMode === 'general') return null;

  const proteinBudget = Math.floor(kcal * MAX_PROTEIN_ENERGY_PERCENT / (100 * PROTEIN_KCAL_PER_GRAM));
  let goal = Math.round(proteinGrams);
  let protein = [goal, goal];
  let fat = fatRange;
  let note = 'Cible de protéines saisie manuellement.';

  if (proteinMode === 'training') {
    const heightSquared = (height / 100) ** 2;
    const bmi = weight / heightSquared;
    const usesGoalWeight = bmi >= 30;
    const referenceBmi = goalWeight / heightSquared;
    if (usesGoalWeight && !(referenceBmi >= 18.5 && referenceBmi < 30)) {
      return { error: 'Pour calculer le repère sportif, renseigne un poids visé correspondant à un IMC de 18,5 à moins de 30 ou utilise la cible manuelle.' };
    }
    if (bmi < 18.5) {
      return { error: 'Le repère sportif automatique suppose un poids de référence adapté à ta taille. Une cible de protéines déjà établie peut être saisie manuellement.' };
    }

    const calculationWeight = usesGoalWeight ? goalWeight : weight;
    const gramsPerKilo = proteinPerKg ?? 1.6;
    goal = Math.round(calculationWeight * gramsPerKilo);
    const uncappedMaximum = Math.round(calculationWeight * 2);
    protein = [Math.round(calculationWeight * 1.2), Math.min(uncappedMaximum, proteinBudget)];
    fat = [Math.ceil(kcal * 20 / (100 * FAT_KCAL_PER_GRAM)), Math.floor(kcal * 35 / (100 * FAT_KCAL_PER_GRAM))];
    const weightLabel = usesGoalWeight ? 'poids visé' : 'poids actuel';
    note = `Repère sportif à ${FR_NUMBER.format(gramsPerKilo)} g/kg/j sur ${FR_NUMBER.format(calculationWeight)} kg (${weightLabel}).`;
    if (proteinBudget < uncappedMaximum) {
      note += ' La fourchette affichée est limitée à 35 % de l’énergie pour répartir le budget.';
    }
  }

  if (goal > proteinBudget) {
    return { error: `Avec ${FR_NUMBER.format(kcal)} kcal, la répartition d’Assiette réserve au plus 35 % de l’énergie aux protéines, soit ${FR_NUMBER.format(proteinBudget)} g.` };
  }
  if (!Number.isFinite(goal) || goal < protein[0] || goal > protein[1] || goal < 1) {
    return { error: 'Renseigne une cible de protéines dans la fourchette disponible.' };
  }

  const remaining = kcal - goal * PROTEIN_KCAL_PER_GRAM;
  const carbs = [
    Math.floor((remaining - fat[1] * FAT_KCAL_PER_GRAM) / CARB_KCAL_PER_GRAM),
    Math.floor((remaining - fat[0] * FAT_KCAL_PER_GRAM) / CARB_KCAL_PER_GRAM),
  ];
  if (carbs[0] < 1 || carbs[0] > carbs[1]) {
    return { error: 'Choisis une cible de protéines qui laisse de la place aux glucides et aux lipides dans ce budget.' };
  }

  return { goal, protein, carbs, fat, note };
}
