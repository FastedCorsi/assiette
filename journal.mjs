import { SPORT_OPTIONS, sportCaloriesPerDay, sportMet } from './activity.mjs';
import { proteinPlan } from './protein-targets.mjs';

const JOURNAL_KEY = 'assiette-journal-v1';
const NUTRIENTS = { kcal: 1000, protein: 100, carbs: 100, fat: 100 };
const ACTIVITY_FACTORS = { 'mostly-seated': 1.4, 'on-feet': 1.6, physical: 1.8, 'very-physical': 2 };
// Henry (2005), table 15. MJ/day from body weight (kg) and height (m).
const HENRY = {
  male: [[0.0600, 1.31, 0.473], [0.0476, 2.26, -0.574], [0.0478, 2.26, -1.07]],
  female: [[0.0433, 2.57, -1.18], [0.0342, 2.10, -0.0486], [0.0356, 1.76, 0.0448]],
};
const FR_NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBetween(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function isOptional(value, min, max) {
  return value == null || isBetween(value, min, max);
}

function validProfile(profile) {
  return isRecord(profile) &&
    (profile.name == null || (typeof profile.name === 'string' && profile.name.length <= 100)) &&
    Number.isInteger(profile.age) && isBetween(profile.age, 18, 110) &&
    ['female', 'male'].includes(profile.sex) &&
    isBetween(profile.height, 100, 250) && isBetween(profile.weight, 25, 350) &&
    ['maintain', 'lose', 'gain'].includes(profile.goal) && Object.hasOwn(ACTIVITY_FACTORS, profile.activity) &&
    Number.isInteger(profile.sport) && isBetween(profile.sport, 0, 7) &&
    (profile.sportType == null || Object.hasOwn(SPORT_OPTIONS, profile.sportType)) &&
    isOptional(profile.sportMinutes, 1, 360) &&
    isOptional(profile.goalWeight, 25, 350) && isOptional(profile.water, 0.5, 6) &&
    isOptional(profile.customCalories, 1200, 7000) &&
    (profile.deficit == null || (Number.isInteger(profile.deficit) && isBetween(profile.deficit, 0, 750))) &&
    (profile.proteinMode == null || ['general', 'training', 'manual'].includes(profile.proteinMode)) &&
    isOptional(profile.proteinPerKg, 1.2, 2) &&
    (profile.proteinGrams == null || (Number.isInteger(profile.proteinGrams) && isBetween(profile.proteinGrams, 1, 400)));
}

function bodyMassIndex(weight, height) {
  return weight / (height / 100) ** 2;
}

function energyAdjustment(profile, maintenance) {
  const { goal, goalWeight, height, weight } = profile;
  if (goal === 'lose' && (bodyMassIndex(weight, height) < 18.5 ||
      (goalWeight != null && bodyMassIndex(goalWeight, height) < 18.5))) {
    return { kcal: 0, notice: 'Repère de maintien, car le poids actuel ou visé est bas pour la taille saisie.' };
  }
  if (goalWeight != null && ((goal === 'lose' && weight <= goalWeight) ||
      (goal === 'gain' && weight >= goalWeight))) {
    return { kcal: 0, notice: 'Le poids visé est déjà atteint. Le calcul utilise un repère de maintien.' };
  }
  if (goal === 'lose') {
    const deficit = profile.deficit ?? 500;
    if (deficit === 0) return { kcal: 0, notice: 'Le déficit choisi est de 0 kcal. Le repère correspond au maintien.' };
    if (bodyMassIndex(weight, height) < 25) {
      return { kcal: 0, notice: 'Le déficit automatique s’applique à partir d’un IMC de 25. Le repère affiché correspond au maintien.' };
    }
    const floor = profile.sex === 'male' ? 1500 : 1200;
    if (maintenance - deficit < floor) {
      return { kcal: 0, notice: 'Le repère de maintien est conservé, car le déficit choisi donnerait un apport très bas.' };
    }
    return { kcal: -deficit, notice: '' };
  }
  if (goal === 'gain') return { kcal: 300, notice: 'Repère de prise de poids · 300 kcal de plus que le maintien estimé.' };
  return { kcal: 0, notice: '' };
}

function maintenanceEnergy(profile) {
  const { age, sex, height, weight, activity } = profile;
  const [perKg, perMetre, constant] = HENRY[sex][age < 30 ? 0 : age < 60 ? 1 : 2];
  const basalKcal = (perKg * weight + perMetre * (height / 100) + constant) * 1000 / 4.184;
  return basalKcal * ACTIVITY_FACTORS[activity] + sportCaloriesPerDay(profile);
}

export function energyPlan(profile) {
  if (!validProfile(profile)) return null;
  const unroundedMaintenance = maintenanceEnergy(profile);
  const maintenance = Math.round(unroundedMaintenance);
  const adjustment = profile.customCalories == null ? energyAdjustment(profile, unroundedMaintenance) : null;
  const kcal = Math.round(profile.customCalories ?? (unroundedMaintenance + adjustment.kcal));
  const notice = adjustment?.notice ?? 'Le repère calorique manuel est utilisé.';
  return { maintenance, kcal, difference: kcal - maintenance, notice };
}

function gramsRange(energy, low, high, kcalPerGram) {
  return [Math.ceil(energy * low / (100 * kcalPerGram)), Math.floor(energy * high / (100 * kcalPerGram))];
}

export function targetNotice(profile, targets = calculateTargets(profile), energy = energyPlan(profile)) {
  if (!targets) return '';
  const messages = [];
  if (energy?.notice) messages.push(energy.notice);
  if (profile.sport > 0 && profile.age < 19) {
    messages.push('Les tables de sport utilisées commencent à 19 ans. Le calcul utilise ton activité hors sport.');
  } else if (profile.sport > 0 && (!profile.sportMinutes || !profile.sportType)) {
    messages.push('Ajoute le type de sport et la durée d’une séance pour compter ton entraînement.');
  } else if (profile.sport > 0 && sportMet(profile.age, profile.sportType) == null) {
    messages.push('Le Compendium ne fournit pas de valeur pour cette activité et cette tranche d’âge. Le calcul utilise ton activité hors sport.');
  }
  const protein = proteinPlan(profile, targets.kcal, targets.ranges.fat);
  if (protein?.error || protein?.note) messages.push(protein.error ?? protein.note);
  const proteinReference = Math.ceil(profile.weight * (profile.age > 70 ? 1 : 0.83));
  if (targets.proteinGoal == null && proteinReference > targets.ranges.protein[1]) {
    messages.push('La référence de protéines par kg dépasse la fourchette calculée avec ce repère d’énergie.');
  }
  return messages.join(' ');
}

export function calculateTargets(profile) {
  const energy = energyPlan(profile);
  if (!energy) return null;
  const { kcal } = energy;
  const { age, sex, activity, weight, water } = profile;
  const highOccupationalActivity = activity === 'very-physical' && age <= 70;
  const lowActivity = activity === 'mostly-seated' && sportCaloriesPerDay(profile) === 0;
  const proteinPercent = age > 70 ? 15 : lowActivity && age > (sex === 'female' ? 50 : 60) ? 12 : 10;
  const proteinRange = gramsRange(kcal, proteinPercent, 20, 4);
  const proteinReference = Math.ceil(weight * (age > 70 ? 1 : 0.83));
  if (proteinReference <= proteinRange[1]) proteinRange[0] = Math.max(proteinReference, proteinRange[0]);
  const ranges = {
    protein: proteinRange,
    carbs: highOccupationalActivity ? gramsRange(kcal, 50, 60, 4) : gramsRange(kcal, 40, 55, 4),
    fat: highOccupationalActivity ? gramsRange(kcal, 30, 35, 9) : gramsRange(kcal, 35, 40, 9),
  };
  const protein = proteinPlan(profile, kcal, ranges.fat);
  if (protein && !protein.error) {
    ranges.protein = protein.protein;
    ranges.carbs = protein.carbs;
    ranges.fat = protein.fat;
  }
  if (water == null) ranges.water = [1500, 2000];
  return {
    kcal,
    protein: ranges.protein[0],
    carbs: ranges.carbs[0],
    fat: ranges.fat[0],
    water: Math.round((water ?? 1.5) * 1000),
    ranges,
    ...(protein?.goal != null ? { proteinGoal: protein.goal } : {}),
  };
}

export function localDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return localDate(date) === dateKey ? date : null;
}

export function shiftDate(dateKey, numberOfDays) {
  const date = dateFromKey(dateKey);
  if (!date || !Number.isInteger(numberOfDays)) return null;
  date.setDate(date.getDate() + numberOfDays);
  return Number.isNaN(date.getTime()) ? null : localDate(date);
}

export function formatDate(dateKey, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const date = dateFromKey(dateKey);
  return date ? new Intl.DateTimeFormat('fr-FR', options).format(date) : '';
}

function isPlainWater(item) {
  const label = item.name.split(' · ')[0].trim().toLocaleLowerCase('fr-FR');
  return /^eau(?: (?:plate|gazeuse|pétillante|minérale|naturelle|de source|du robinet|en bouteille))*$/.test(label) &&
    (item.kcal == null || item.kcal === 0);
}

export function aggregateEntries(entries) {
  const missing = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0, plainWater: 0, estimated: 0, unknown: 0, entries: entries.length, missing };
  for (const entry of entries) {
    for (const item of entry.items) {
      if (item.estimated) totals.estimated += 1;
      if (entry.kind === 'drink' && item.unit === 'ml') {
        totals.water += item.grams;
        if (isPlainWater(item)) totals.plainWater += item.grams;
      }
      let hasMissingNutrient = false;
      for (const nutrient of Object.keys(NUTRIENTS)) {
        if (Number.isFinite(item[nutrient])) {
          totals[nutrient] += item[nutrient] * item.grams / 100;
        } else {
          missing[nutrient] += 1;
          hasMissingNutrient = true;
        }
      }
      if (hasMissingNutrient) totals.unknown += 1;
    }
  }
  return totals;
}

export function summarizeDay(entries, targets) {
  const totals = aggregateEntries(entries);
  const positive = [];
  const attention = [];
  if (!entries.length) {
    return { positive, attention: ['Ajoute un repas ou une boisson pour établir le bilan.'] };
  }

  if (totals.unknown) {
    attention.push(totals.unknown === 1
      ? 'Un ingrédient a des valeurs manquantes. Les totaux concernés sont partiels.'
      : `${totals.unknown} ingrédients ont des valeurs manquantes. Les totaux concernés sont partiels.`);
  }
  if (totals.estimated) {
    attention.push(totals.estimated === 1
      ? 'Une quantité a été estimée et peut être ajustée.'
      : `${totals.estimated} quantités ont été estimées et peuvent être ajustées.`);
  }
  if (!targets) {
    attention.push('Aucun repère disponible pour cette journée.');
    return { positive, attention };
  }

  const countsPlainWater = Boolean(targets.ranges?.water);
  const labels = { kcal: 'Énergie', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides',
    water: countsPlainWater ? 'Eau saisie' : 'Boissons saisies' };
  for (const [nutrient, label] of Object.entries(labels)) {
    if (totals.missing[nutrient]) continue;
    const amount = nutrient === 'water' && countsPlainWater ? totals.plainWater : totals[nutrient];
    const minimum = targets[nutrient];
    const maximum = targets.ranges?.[nutrient]?.[1] ?? minimum;
    const unit = nutrient === 'kcal' ? 'kcal' : nutrient === 'water' ? 'ml' : 'g';
    const formatGap = difference => `${FR_NUMBER.format(difference)} ${unit}`;
    if (nutrient === 'protein' && targets.proteinGoal != null) {
      const difference = targets.proteinGoal - amount;
      if (difference <= 0) positive.push('Protéines · cible atteinte.');
      else attention.push(`Protéines à ${formatGap(difference)} de la cible.`);
      continue;
    }
    if (nutrient === 'water' && amount >= minimum) {
      positive.push(`${label} · repère atteint.`);
    } else if ((amount >= minimum && amount <= maximum) || (!targets.ranges?.[nutrient] && Math.round(amount) === minimum)) {
      positive.push(maximum === minimum ? `${label} · repère atteint.` : `${label} dans la fourchette de référence.`);
    } else {
      attention.push(amount < minimum
        ? `${label} à ${formatGap(minimum - amount)} sous le repère.`
        : `${label} à ${formatGap(amount - maximum)} au-dessus du repère.`);
    }
  }
  return { positive, attention };
}

function normalizeProfile(profile) {
  if (profile === null) return null;
  if (!validProfile(profile)) throw new Error('Le profil du fichier est invalide.');
  const {
    name, age, sex, height, weight, goal, activity, sport, goalWeight, water, customCalories,
    sportType, sportMinutes, deficit, proteinMode, proteinPerKg, proteinGrams,
  } = profile;
  return { name: name?.trim() ?? '', age, sex, height, weight, goal, activity, sport,
    ...(sportType != null ? { sportType } : {}), ...(sportMinutes != null ? { sportMinutes } : {}),
    ...(deficit != null ? { deficit } : {}),
    ...(proteinMode != null && proteinMode !== 'general' ? { proteinMode } : {}),
    ...(proteinPerKg != null ? { proteinPerKg } : {}), ...(proteinGrams != null ? { proteinGrams } : {}),
    goalWeight: goalWeight ?? null, water: water ?? null, customCalories: customCalories ?? null };
}

function normalizeTargets(targets) {
  if (targets == null) return null;
  if (!isRecord(targets)) throw new Error('Les repères de la journée sont invalides.');
  const { kcal, protein, carbs, fat, water } = targets;
  if (!isBetween(kcal, 1, 50000) || !isBetween(protein, 1, 2500) ||
      !isBetween(carbs, 1, 7500) || !isBetween(fat, 1, 2300) || !isBetween(water, 500, 6000)) {
    throw new Error('Les repères de la journée sont invalides.');
  }
  const normalized = { kcal, protein, carbs, fat, water };
  if (targets.ranges == null && targets.proteinGoal == null) return normalized;
  if (!isRecord(targets.ranges)) throw new Error('Les fourchettes de la journée sont invalides.');
  const ranges = {};
  for (const key of ['protein', 'carbs', 'fat', 'water']) {
    const range = targets.ranges[key];
    if (key === 'water' && range == null) continue;
    if (!Array.isArray(range) || range.length !== 2 || range[0] !== normalized[key] ||
        !isBetween(range[1], range[0], key === 'water' ? 6000 : kcal)) {
      throw new Error('Les fourchettes de la journée sont invalides.');
    }
    ranges[key] = [...range];
  }
  if (targets.proteinGoal == null) return { ...normalized, ranges };
  if (!isBetween(targets.proteinGoal, ranges.protein[0], ranges.protein[1])) {
    throw new Error('La cible de protéines de la journée est invalide.');
  }
  return { ...normalized, ranges, proteinGoal: targets.proteinGoal };
}

function normalizeItem(item) {
  if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim() ||
      !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 100000 ||
      !['g', 'ml'].includes(item.unit) || typeof item.estimated !== 'boolean') {
    throw new Error('Un ingrédient est invalide.');
  }
  const normalized = {
    name: item.name.trim(), grams: item.grams, unit: item.unit, estimated: item.estimated,
    source: typeof item.source === 'string' ? item.source : '',
  };
  if (typeof item.query === 'string') normalized.query = item.query;
  for (const [nutrient, max] of Object.entries(NUTRIENTS)) {
    if (!isOptional(item[nutrient], 0, max)) throw new Error('Une valeur nutritionnelle est invalide.');
    normalized[nutrient] = item[nutrient] ?? null;
  }
  return normalized;
}

function normalizeEntry(entry) {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id ||
      typeof entry.label !== 'string' || !['meal', 'drink'].includes(entry.kind) ||
      typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
      !Array.isArray(entry.items) || !entry.items.length) {
    throw new Error('Une entrée du journal est invalide.');
  }
  return { id: entry.id, label: entry.label, kind: entry.kind, at: entry.at, items: entry.items.map(normalizeItem) };
}

function normalizeJournal(state) {
  if (!isRecord(state) || (state.version != null && state.version !== 1) || !isRecord(state.days)) {
    throw new Error('Le format du journal est invalide.');
  }
  const profile = normalizeProfile(state.profile);
  const days = {};
  for (const [dateKey, day] of Object.entries(state.days)) {
    if (!dateFromKey(dateKey) || !isRecord(day) || !Array.isArray(day.entries) || !isOptional(day.weight, 25, 350)) {
      throw new Error('Une journée du journal est invalide.');
    }
    const entries = day.entries.map(normalizeEntry);
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
      throw new Error('Une journée du journal contient des entrées en double.');
    }
    days[dateKey] = { entries, targets: normalizeTargets(day.targets) };
    if (day.weight != null) days[dateKey].weight = day.weight;
  }
  return { profile, days };
}

export function importJournal(jsonText) {
  let state;
  try {
    state = JSON.parse(jsonText);
  } catch {
    throw new Error('Le fichier ne contient pas un journal JSON valide.');
  }
  return normalizeJournal(state);
}

export function exportJournal(state) {
  return JSON.stringify({ version: 1, ...normalizeJournal(state) }, null, 2);
}

export function loadJournal(storage = globalThis.localStorage) {
  const saved = storage.getItem(JOURNAL_KEY);
  return saved === null ? { profile: null, days: {} } : importJournal(saved);
}

export function saveJournal(state, storage = globalThis.localStorage) {
  storage.setItem(JOURNAL_KEY, JSON.stringify({ version: 1, ...normalizeJournal(state) }));
}
