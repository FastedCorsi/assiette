const JOURNAL_KEY = 'assiette-journal-v1';
const NUTRIENTS = { kcal: 1000, protein: 100, carbs: 100, fat: 100 };
const ACTIVITY_FACTORS = { 'mostly-seated': 1.4, 'on-feet': 1.55, physical: 1.7 };
const FR_NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

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
    isOptional(profile.goalWeight, 25, 350) && isOptional(profile.water, 0.5, 6) &&
    isOptional(profile.customCalories, 1200, 7000);
}

function bodyMassIndex(weight, height) {
  return weight / (height / 100) ** 2;
}

function blockedGoal(profile) {
  const { goal, goalWeight, height, weight } = profile;
  if (goal === 'lose' && (bodyMassIndex(weight, height) < 18.5 ||
      (goalWeight != null && bodyMassIndex(goalWeight, height) < 18.5))) {
    return 'Le calcul conserve un repère de maintien, car le poids actuel ou visé est bas pour la taille saisie.';
  }
  if (goalWeight != null && ((goal === 'lose' && weight <= goalWeight) ||
      (goal === 'gain' && weight >= goalWeight))) {
    return 'Le poids saisi a déjà atteint ou dépassé le poids visé. Le calcul utilise un repère de maintien.';
  }
  return '';
}

export function targetNotice(profile) {
  if (!validProfile(profile)) return '';
  if (profile.customCalories != null) return 'Le repère calorique manuel est utilisé.';
  return blockedGoal(profile);
}

export function calculateTargets(profile) {
  if (!validProfile(profile)) return null;
  const { age, sex, height, weight, goal, activity, sport, water, customCalories } = profile;
  // Mifflin–St Jeor estimates resting energy expenditure. The weekly sport
  // increment is an app estimate, since frequency alone cannot give duration or intensity.
  const resting = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  const activityFactor = Math.min(2.05, ACTIVITY_FACTORS[activity] + sport * 0.045);
  const minimumCalories = sex === 'male' ? 1600 : 1400;
  const maintenance = Math.max(minimumCalories, resting * activityFactor);
  let automaticCalories = maintenance;
  if (goal !== 'maintain' && !blockedGoal(profile)) {
    automaticCalories += goal === 'lose' ? -Math.min(300, maintenance * 0.1) : Math.min(250, maintenance * 0.07);
  }
  const kcal = Math.round(customCalories ?? Math.max(minimumCalories, automaticCalories));
  const proteinFraction = Math.min(0.2, 0.15 + sport * 0.008);
  const fatFraction = 0.35;
  return {
    kcal,
    protein: Math.round(kcal * proteinFraction / 4),
    carbs: Math.round(kcal * (1 - proteinFraction - fatFraction) / 4),
    fat: Math.round(kcal * fatFraction / 9),
    water: Math.round((water ?? (sex === 'male' ? 2 : 1.5)) * 1000),
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

export function aggregateEntries(entries) {
  const missing = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0, estimated: 0, unknown: 0, entries: entries.length, missing };
  for (const entry of entries) {
    for (const item of entry.items) {
      if (item.estimated) totals.estimated += 1;
      if (entry.kind === 'drink' && item.unit === 'ml') totals.water += item.grams;
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

  const labels = { kcal: 'Énergie', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides', water: 'Boissons saisies' };
  for (const [nutrient, label] of Object.entries(labels)) {
    if (totals.missing[nutrient]) continue;
    const difference = totals[nutrient] - targets[nutrient];
    const unit = nutrient === 'kcal' ? 'kcal' : nutrient === 'water' ? 'ml' : 'g';
    const gap = `${FR_NUMBER.format(Math.abs(difference))} ${unit}`;
    if (nutrient === 'water' && difference >= 0) {
      positive.push('Le volume de boissons saisi atteint le repère.');
    } else if (Math.abs(difference) <= targets[nutrient] * 0.1) {
      positive.push(`${label} dans la zone du repère.`);
    } else {
      attention.push(difference < 0
        ? `${label} à environ ${gap} sous le repère.`
        : `${label} à environ ${gap} au-dessus du repère.`);
    }
  }
  return { positive, attention };
}

function normalizeProfile(profile) {
  if (profile === null) return null;
  if (!validProfile(profile)) throw new Error('Le profil du fichier est invalide.');
  const { name, age, sex, height, weight, goal, activity, sport, goalWeight, water, customCalories } = profile;
  return { name: name?.trim() ?? '', age, sex, height, weight, goal, activity, sport,
    goalWeight: goalWeight ?? null, water: water ?? null, customCalories: customCalories ?? null };
}

function normalizeTargets(targets) {
  if (targets == null) return null;
  if (!isRecord(targets)) throw new Error('Les repères de la journée sont invalides.');
  const { kcal, protein, carbs, fat, water } = targets;
  if (!isBetween(kcal, 1200, 12000) || !isBetween(protein, 1, 1200) ||
      !isBetween(carbs, 1, 2000) || !isBetween(fat, 1, 1000) || !isBetween(water, 500, 6000)) {
    throw new Error('Les repères de la journée sont invalides.');
  }
  return { kcal, protein, carbs, fat, water };
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
