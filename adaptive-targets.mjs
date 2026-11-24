import { aggregateEntries, calculateTargets, energyPlan, shiftDate } from './journal.mjs?v=simple-3';

const DAYS_PER_WEEK = 7;
const MIN_LOGGED_DAYS = 5;
const MIN_WEIGH_INS = 3;
const MAX_ESTIMATED_ENERGY_SHARE = 0.20;
const MAX_AVERAGE_TARGET_GAP = 125;
const MAX_TARGET_DRIFT = 75;
const TRIAL_KCAL = 100;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((first, second) => first - second);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

function summarizeWeek(days, today, firstOffset) {
  const logs = [];
  const weights = [];
  for (let offset = firstOffset; offset < firstOffset + DAYS_PER_WEEK; offset += 1) {
    const day = days?.[shiftDate(today, -offset)];
    if (Number.isFinite(day?.weight) && day.weight > 0) weights.push(day.weight);
    if (day?.complete !== true || !day.entries.length || !Number.isFinite(day.targets?.kcal) || day.targets.kcal <= 0) continue;
    const totals = aggregateEntries(day.entries);
    if (totals.missing.kcal || totals.kcal <= 0) continue;

    let estimatedEnergy = 0;
    for (const entry of day.entries) {
      for (const item of entry.items) {
        if (item.estimated) estimatedEnergy += item.grams * item.kcal / 100;
      }
    }
    logs.push({ kcal: totals.kcal, target: day.targets.kcal, estimatedEnergy });
  }
  return { logs, weighIns: weights.length, weight: median(weights) };
}

function summarizePeriod(weeks) {
  const logs = weeks.flatMap(week => week.logs);
  return {
    loggedDays: logs.length,
    weighIns: weeks.reduce((count, week) => count + week.weighIns, 0),
    averageKcal: mean(logs.map(log => log.kcal)),
    averageTarget: mean(logs.map(log => log.target)),
    averageWeight: mean(weeks.map(week => week.weight).filter(weight => weight != null)),
  };
}

function hasPrecision(weeks) {
  return weeks.every(({ logs }) => {
    const energy = logs.reduce((sum, log) => sum + log.kcal, 0);
    const estimatedEnergy = logs.reduce((sum, log) => sum + log.estimatedEnergy, 0);
    return estimatedEnergy <= MAX_ESTIMATED_ENERGY_SHARE * energy;
  });
}

function canTrial(profile, plan, kcal) {
  const floor = profile.sex === 'male' ? 1500 : 1200;
  if (kcal < Math.max(floor, plan.maintenance - 750) || kcal > Math.min(7000, plan.maintenance + 500)) return false;
  if ((profile.goal === 'lose' && (kcal >= plan.maintenance || plan.difference >= 0)) ||
      (profile.goal === 'gain' && (kcal <= plan.maintenance || plan.difference <= 0))) return false;
  const targets = calculateTargets({ ...profile, customCalories: kcal });
  return Boolean(targets) && (profile.proteinMode == null || profile.proteinMode === 'general' || targets.proteinGoal != null);
}

// Compare four observed weeks without converting a weight change into a calorie deficit.
// National Academies 2023, Dietary Reference Intakes for Energy, chapter 7.
// Coverage, uncertainty thresholds, and the optional 100 kcal trial are choices made by Assiette.
export function calorieReview(days, today, profile) {
  const weeks = [22, 15, 8, 1].map(offset => summarizeWeek(days, today, offset));
  const previous = summarizePeriod(weeks.slice(0, 2));
  const latest = summarizePeriod(weeks.slice(2));
  const enoughWeights = weeks.every(week => week.weighIns >= MIN_WEIGH_INS);
  const weightDelta = enoughWeights ? latest.averageWeight - previous.averageWeight : null;
  const result = (status, message, suggestion = null) => ({ status, message, previous, latest, weightDelta, suggestion });
  const plan = energyPlan(profile);
  if (!plan) return result('unavailable', 'Renseigne ton profil et ton objectif pour interpréter la tendance.');
  if (!enoughWeights || weeks.some(week => week.logs.length < MIN_LOGGED_DAYS)) {
    return result('insufficient', 'Pour comparer les quatre dernières semaines, confirme au moins cinq journées au total calorique complet et enregistre trois pesées par semaine.');
  }

  const tolerance = Math.max(0.2, previous.averageWeight * 0.003);
  const trend = Math.abs(weightDelta) <= tolerance ? 0 : Math.sign(weightDelta);
  const goalDirection = { lose: -1, maintain: 0, gain: 1 }[profile.goal];
  const heightInMeters = profile.height / 100;
  const bmi = profile.weight / heightInMeters ** 2;
  const goalBmi = (profile.goalWeight ?? profile.weight) / heightInMeters ** 2;
  const closeToGoal = goalDirection && profile.goalWeight != null &&
    (profile.goalWeight - latest.averageWeight) * goalDirection <= Math.max(0.5, tolerance);
  const reachedAtCurrentWeight = goalDirection && profile.goalWeight != null &&
    (profile.goalWeight - profile.weight) * goalDirection <= 0;

  if (Math.abs(weightDelta) / 2 > Math.min(0.9, previous.averageWeight * 0.01)) {
    return result('review', 'Le poids moyen varie vite sur cette période. Vérifie la régularité des pesées et les changements récents de ton activité avant de revoir la cible.');
  }
  if (closeToGoal) return result('goal-reached', 'Ton poids moyen est proche du poids visé ou l’a atteint. Fais le point sur ton objectif dans Profil.');
  if (reachedAtCurrentWeight) return result('review', 'Ton dernier poids atteint l’objectif. Attends que les prochaines pesées confirment la tendance et vérifie tes repères dans Profil.');
  const weights = weeks.map(week => week.weight);
  const sustained = trend === 0 ? Math.max(...weights) - Math.min(...weights) <= tolerance * 2 :
    weights.slice(2).every((weight, index) => (weight - previous.averageWeight) * trend >= tolerance / 2 &&
      (weight - weights[index + 1]) * trend >= -tolerance / 2);
  if (!sustained) return result('review', 'Les pesées fluctuent selon les semaines. Poursuis le suivi pour voir si une direction se confirme.');
  if (trend === goalDirection) {
    return goalDirection ? result('progress', 'Le poids moyen évolue dans le sens de ton objectif. Observe les prochaines semaines avant de revoir la cible.') :
      result('stable', 'Ton poids moyen est stable sur la période. Tu peux poursuivre ton suivi avec la cible actuelle.');
  }

  const logs = weeks.flatMap(week => week.logs);
  if (logs.some(log => Math.abs(log.target - plan.kcal) > MAX_TARGET_DRIFT)) {
    return result('review', 'Tes repères ont varié pendant la période. Observe plusieurs semaines avec la cible actuelle avant de la revoir.');
  }
  if (!hasPrecision(weeks) || weeks.some(({ logs }) => mean(logs.map(log => Math.abs(log.kcal - log.target))) > MAX_AVERAGE_TARGET_GAP)) {
    return result('review', 'Avant de revoir ta cible, mesure les portions principales et vérifie que tes apports consignés sont proches de la cible sur plusieurs semaines.');
  }
  const delta = (goalDirection || -trend) * TRIAL_KCAL;
  const kcal = plan.kcal + delta;
  if (bmi < 18.5 || goalBmi < 18.5 || (profile.goal === 'lose' && Math.min(bmi, latest.averageWeight / heightInMeters ** 2) < 25) ||
      !canTrial(profile, plan, kcal)) {
    return result('review', 'Fais le point sur ton objectif et tes repères actuels dans Profil. La tendance seule ne suffit pas pour proposer un chiffre adapté.');
  }
  const adjustment = delta < 0 ? 'une petite baisse' : 'une petite hausse';
  return result('suggestion', `Avec quatre semaines comparables, tu peux envisager ${adjustment} de ta cible, puis observer la tendance sur les prochaines semaines.`, { kcal, delta });
}
