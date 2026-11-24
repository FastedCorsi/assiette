import { CIQUAL_FOODS } from './ciqual-catalog.mjs?v=simple-3';

const STOP_WORDS = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'pour']);
const INVARIABLE = new Set(['ananas', 'anis', 'cassis', 'chips', 'couscous', 'mais', 'merlus', 'panais', 'paris', 'radis', 'tapas']);
const IGNORED_PARTS = new Set(['chair', 'chair et peau', 'chair sans peau', 'pulpe', 'sans noyau', 'sans pepin', 'avec pepin', 'sans sel ajoute']);
const PREPARATION = /^(?:cru|cuit(?: a l eau| a l etouffee| a la vapeur| au four)?|bouilli|braise|grille|roti)$/;
let index;
const foodByCode = new Map(CIQUAL_FOODS.map(([code, name, kcal, protein, carbs, fat, fiber]) => [
  code, { name, kcal, protein, carbs, fat, fiber, source: 'Ciqual 2025', unit: 'g' },
]));

export function findCiqualFoodByCode(code) {
  return foodByCode.get(code) ?? null;
}

function normalize(name) {
  return name.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/\s*%/g, '%')
    .replace(/[^a-z0-9%]+/g, ' ').trim();
}

function singular(word) {
  const preparation = /^(cru|cuit|bouilli|roti|braise|grille)e?s?$/.exec(word);
  if (preparation) return preparation[1];
  if (word === 'choux') return 'chou';
  if (word.length >= 5 && word.endsWith('s') && !INVARIABLE.has(word)) return word.slice(0, -1);
  return word;
}

function singularKey(normalized) {
  return normalized.split(' ').map(singular).join(' ');
}

function headNames(head) {
  const alternatives = head.split(' ou ');
  // The catalog links certain foods explicitly, e.g. « Clémentine ou mandarine ».
  // A phrase like « mélange de fruits ou légumes » does not define synonyms.
  if (alternatives.length > 1 && alternatives.every(name => /^[a-z]+$/.test(name))) {
    return [head, ...alternatives];
  }
  return [head];
}

function addUnique(map, key, entry) {
  if (!key) return;
  if (!map.has(key)) map.set(key, entry);
  else if (map.get(key) !== entry) map.set(key, null);
}

function descriptorAliases(heads, descriptors) {
  const parts = descriptors.map(descriptor => descriptor.split('/').map(value => singularKey(normalize(value))));
  const preparations = parts.filter(part => part.every(value => PREPARATION.test(value)));
  if (preparations.length !== 1) return { labels: [], restricted: [] };

  const qualifiers = parts.filter(part => part !== preparations[0]).map(part => part.join(' '))
    .filter(part => !IGNORED_PARTS.has(part)).join(' ');
  const bareLabels = heads.flatMap(head => preparations[0].map(preparation => `${head} ${preparation}`));
  if (!qualifiers) return { labels: bareLabels, restricted: [] };

  const labels = heads.flatMap(head => preparations[0].flatMap(preparation => [
    `${head} ${qualifiers} ${preparation}`, `${head} ${preparation} ${qualifiers}`,
  ]));
  return { labels, restricted: bareLabels };
}

function getIndex() {
  if (index) return index;
  const exact = new Map();
  const literal = new Map();
  const aliases = new Map();
  const baseRows = new Map();
  const entries = [];

  for (const food of foodByCode.values()) {
    const { name } = food;
    const key = normalize(name);
    const searchable = singularKey(key);
    const withoutAverage = name.replace(/\s*\(aliment moyen\)\s*$/i, '');
    const [head, ...descriptors] = withoutAverage.split(/,\s+/);
    const heads = headNames(singularKey(normalize(head)));
    const prepared = descriptorAliases(heads, descriptors);
    const raw = prepared.labels.includes(`${heads[0]} cru`);
    const labels = [...heads, ...prepared.labels];
    const commonName = /\(dit(?:e?s?) ([^)]+)\)$/i.exec(head)?.[1];
    if (commonName) labels.push(singularKey(normalize(commonName)));
    const entry = { searchable, content: searchable.split(' '), labels, raw, food };
    entries.push(entry);
    addUnique(exact, key, entry);
    // Terminal « aliment moyen » is a catalog qualifier; it can be omitted.
    addUnique(literal, singularKey(normalize(withoutAverage)), entry);
    for (const alias of prepared.labels) addUnique(aliases, alias, entry);
    // A cooking method alone cannot choose between rows with different qualifiers.
    for (const alias of prepared.restricted) addUnique(aliases, alias, null);
    for (const bare of heads) addUnique(baseRows, bare, entry);
  }

  for (const [key, entry] of baseRows) {
    if (entry?.raw) addUnique(aliases, key, entry);
  }
  index = { exact, literal, aliases, entries };
  return index;
}

export function findCiqualFood(name) {
  const exactKey = normalize(name);
  if (!exactKey) return null;
  const key = singularKey(exactKey);
  const { exact, literal, aliases } = getIndex();
  // An ambiguous exact key should stay ambiguous even if a looser alias is unique.
  if (exact.has(exactKey)) return exact.get(exactKey)?.food ?? null;
  if (literal.has(key)) return literal.get(key)?.food ?? null;
  return aliases.get(key)?.food ?? null;
}

export function searchCiqualFoods(query, limit = 8) {
  const queryKey = singularKey(normalize(query));
  const tokens = [...new Set(queryKey.split(' ').filter(word => word && !STOP_WORDS.has(word)))];
  if (!tokens.length || limit <= 0) return [];
  const preferred = findCiqualFood(query);
  const candidates = [];
  for (const entry of getIndex().entries) {
    let missing = false;
    let prefixes = 0;
    for (const token of tokens) {
      if (entry.content.includes(token)) continue;
      if (token.length >= 3 && entry.content.some(word => word.startsWith(token))) prefixes += 1;
      else {
        missing = true;
        break;
      }
    }
    if (missing) continue;
    let rank = 5;
    if (entry.food === preferred) rank = 0;
    else if (entry.labels.includes(queryKey)) rank = 1;
    else if (entry.labels.some(label => label.startsWith(queryKey))) rank = entry.raw ? 2 : 3;
    else if (entry.searchable.startsWith(queryKey)) rank = 4;
    candidates.push({ entry, rank, prefixes });
  }
  return candidates.sort((left, right) => left.rank - right.rank || left.prefixes - right.prefixes ||
    left.entry.content.length - right.entry.content.length).slice(0, limit).map(({ entry }) => entry.food);
}
