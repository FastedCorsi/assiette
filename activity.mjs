// 2024 Adult and Older Adult Compendia of Physical Activities.
// Each MET value is paired with its published activity code.
export const SPORT_OPTIONS = {
  walk: { label: 'Marche sur terrain plat, allure modérée', adult: 3.8, older: 4.3 }, // 17190 / 1606060
  strength: { label: 'Musculation, séries de 8 à 15 répétitions', adult: 3.5, older: 4.3 }, // 02054 / 0205460
  bike: { label: 'Vélo d’appartement, 90–100 W', adult: 6.0, older: 6.3 }, // 01220 / 0101260
  circuit: { label: 'Circuit d’entraînement modéré', adult: 5.0, older: 4.5 }, // 02035 / 0203560
  rowing: { label: 'Rameur, 100–149 W', adult: 7.5, older: 9.0 }, // 02072 / 0207360
  yoga: { label: 'Yoga général', adult: 2.3, older: 2.5 }, // 02175 / 0219060
  running: { label: 'Course, environ 8 km/h', adult: 8.5 }, // 12030
  swimming: { label: 'Natation de loisir, crawl lent', adult: 5.8 }, // 18240
};

export function sportMet(age, sportType) {
  if (age < 19 || !Object.hasOwn(SPORT_OPTIONS, sportType)) return null;
  return SPORT_OPTIONS[sportType][age >= 60 ? 'older' : 'adult'] ?? null;
}

export function sportCaloriesPerDay(profile) {
  const { age, weight, sport, sportMinutes, sportType } = profile;
  const met = sportMet(age, sportType);
  if (!met || !sport || !sportMinutes) return 0;
  // Net energy above 1 MET of quiet rest. The oxygen equivalents are 3.5
  // and 2.7 mL/kg/min, respectively, with about 5 kcal per litre of oxygen.
  const oxygenAtRest = age >= 60 ? 2.7 : 3.5;
  return (met - 1) * oxygenAtRest * weight * sportMinutes * sport / (200 * 7);
}
