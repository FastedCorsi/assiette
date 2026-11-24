import { $, $$, el, icon, button, empty, number, volume } from './ui.mjs';
import { parseMeal } from './nutrition.mjs?v=simple-3';
import { openReview } from './review.mjs?v=simple-3';
import { createBackupSync } from './backup-sync.mjs?v=simple-3';
import { SPORT_OPTIONS, sportCaloriesPerDay, sportMet } from './activity.mjs';
import { weightTrend } from './weight-trend.mjs?v=simple-3';
import { dayGuidance, weeklyOverview } from './guidance.mjs?v=simple-3';
import { calorieReview } from './adaptive-targets.mjs?v=simple-3';
import { prepareOffline } from './offline.mjs?v=simple-3';
import {
  calculateTargets, energyPlan, targetNotice, localDate, shiftDate, formatDate, aggregateEntries, knownTotal,
  summarizeDay, loadJournal, saveJournal, exportJournal, importJournal,
} from './journal.mjs?v=simple-3';

const metrics = [
  { key: 'protein', label: 'Protéines', color: '#397d5b' },
  { key: 'carbs', label: 'Glucides', color: '#b78138' },
  { key: 'fat', label: 'Lipides', color: '#87639c' },
  { key: 'fiber', label: 'Fibres', color: '#766740' },
  { key: 'water', label: 'Boissons', color: '#4782a0' },
];
const pageNames = ['journal', 'historique', 'profil'];
const profileForm = $('#profile-form');
const dayPicker = $('#day-picker');
const entryText = $('#entry-text');
const photoFile = $('#photo-file');
const cameraFile = $('#camera-file');
const photoText = $('#photo-text');
const photoPreview = $('#photo-preview');
const photoAnalyze = $('#photo-analyze');
const photoStatus = $('#photo-status');
const photoResults = $('#photo-results');
const weightForm = $('#weight-form');
const backupForm = $('#backup-form');
let journal = { profile: null, days: {} };
let date = localDate();
let lastToday = date;
let mode = 'meal';
let photoUrl = null;
let selectedPhoto = null;
let profileDirty = false;
let historyLimit = 14;
let toastTimer;

function notify(message) {
  const toast = $('#toast');
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function readJournal() {
  try {
    journal = loadJournal();
  } catch {
    notify('Le journal local est indisponible. Vérifie les réglages du navigateur ou importe une sauvegarde.');
  }
}

function updateJournal(change) {
  try {
    const latest = loadJournal();
    change(latest);
    const today = latest.days[localDate()];
    if (today && latest.profile) today.targets = calculateTargets(latest.profile);
    saveJournal(latest);
    journal = latest;
    render();
    cloudBackup.changed();
    return true;
  } catch {
    notify('Enregistrement impossible. Vérifie le stockage du navigateur.');
    return false;
  }
}

function restoreJournal(restored) {
  saveJournal(restored);
  journal = restored;
  populateProfile();
  render();
}

function ensureDay(state, dayKey) {
  state.days[dayKey] ??= { entries: [], targets: calculateTargets(state.profile) };
  return state.days[dayKey];
}

function validDay(dayKey) {
  return dayKey >= '1900-01-01' && dayKey <= localDate() && shiftDate(dayKey, 0) === dayKey;
}

function chooseDate(dayKey) {
  if (validDay(dayKey)) date = dayKey;
  renderJournal();
}

function refreshToday() {
  const today = localDate();
  if (lastToday === today) return;
  if (date === lastToday) date = today;
  if (weightForm.elements.date.value === lastToday) weightForm.elements.date.value = today;
  lastToday = today;
  render();
}

function showPage(scroll = false) {
  const requestedPage = location.hash.slice(1);
  const dataPage = requestedPage === 'donnees';
  const page = dataPage ? 'profil' : pageNames.includes(requestedPage) ? requestedPage : 'journal';
  for (const name of pageNames) $('#' + name).hidden = name !== page;
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (dataPage) {
    $('#backup-title').focus({ preventScroll: true });
    $('#data-panel').scrollIntoView({ block: 'start' });
  } else if (scroll) {
    window.scrollTo({ top: 0 });
  }
}

function updateMeter(meter, amount, target, partial) {
  meter.hidden = !target;
  if (!target) return;
  const percent = Math.min(100, Math.max(0, Math.round(amount / target * 100)));
  meter.setAttribute('aria-valuenow', percent);
  meter.setAttribute('aria-valuetext', number.format(percent) + ' % du repère' + (partial ? ', total partiel' : ''));
  meter.firstElementChild.style.width = percent + '%';
}

function displayMetric(key, amount) {
  if (amount == null) return key === 'kcal' ? '— kcal' : '— g';
  if (key === 'water') return volume(amount);
  if (key === 'kcal') return number.format(Math.round(amount)) + ' kcal';
  return number.format(amount) + ' g';
}

function displayTarget(key, targets) {
  if (key === 'protein' && targets.proteinGoal != null) return displayMetric(key, targets.proteinGoal);
  const range = targets.ranges?.[key];
  if (!range) return displayMetric(key, targets[key]);
  if (key === 'water') return number.format(range[0] / 1000) + '–' + number.format(range[1] / 1000) + ' L';
  return number.format(range[0]) + '–' + number.format(range[1]) + ' g';
}

function signed(value) {
  return (value > 0 ? '+' : value < 0 ? '−' : '') + number.format(Math.abs(value));
}

function metricCard(metric, totals, targets) {
  const { key, label, color } = metric;
  const card = el('section', 'macro-card');
  const countsPlainWater = key === 'water' && Boolean(targets?.ranges?.water);
  const title = el('h2', 'macro-label', countsPlainWater ? 'Eau' : label);
  const value = el('div', 'macro-value');
  const amount = countsPlainWater ? totals.plainWater : knownTotal(totals, key);
  const measured = el('strong', '', displayMetric(key, amount));
  const target = key === 'protein' ? targets?.proteinGoal ?? targets?.protein : targets?.[key];
  const isPartial = Boolean(totals.missing[key]);
  card.style.setProperty('--track-fill', color);
  value.append(measured, el('span', '', (target ? ' / ' + displayTarget(key, targets) : '') + (isPartial ? ' · partiel' : '')));
  const meter = el('div', 'meter');
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Progression ' + title.textContent.toLowerCase());
  meter.append(el('span'));
  updateMeter(meter, amount, amount == null ? null : target, isPartial);
  card.append(title, value, meter);
  if (countsPlainWater) card.append(el('p', 'subtle macro-note', volume(totals.water) + ' de boissons au total'));
  if (key === 'protein' && targets?.proteinGoal != null) {
    const [low, high] = targets.ranges.protein;
    if (low !== high) card.append(el('p', 'subtle macro-note', 'Fourchette · ' + number.format(low) + '–' + number.format(high) + ' g'));
  }
  return card;
}

function renderEnergy(totals, targets) {
  const energy = $('#energy');
  const note = $('#energy-note');
  const kcal = knownTotal(totals, 'kcal');
  const incomplete = totals.missing.kcal > 0;
  energy.replaceChildren(el('strong', '', kcal == null ? '—' : number.format(Math.round(kcal))),
    el('span', '', targets ? '/ ' + displayMetric('kcal', targets.kcal) : 'kcal'));
  updateMeter($('#energy-meter'), kcal, kcal == null ? null : targets?.kcal, incomplete);
  if (kcal == null) {
    note.textContent = 'Calories inconnues. Ouvre une entrée pour compléter ses valeurs.';
  } else if (incomplete) {
    note.textContent = 'Total partiel, des valeurs sont à compléter.';
  } else if (targets) {
    const difference = Math.round(targets.kcal - totals.kcal);
    note.textContent = difference === 0 ? 'Repère atteint.' : displayMetric('kcal', Math.abs(difference)) +
      (difference > 0 ? ' sous ton repère' : ' au-dessus de ton repère');
  } else if (journal.profile) {
    note.textContent = 'Aucun repère enregistré pour cette date.';
  } else {
    const profileLink = el('a', '', 'Configurer mon objectif');
    profileLink.href = '#profil';
    note.replaceChildren(profileLink);
  }
}

function renderSummary(entries, targets) {
  const output = $('#summary');
  if (!entries.length) {
    output.replaceChildren(empty('Ajoute un repas ou une boisson pour voir ton bilan.'));
    return;
  }
  const { positive, attention } = summarizeDay(entries, targets);
  const list = el('ul', 'summary-list');
  for (const [messages, kind] of [[positive, 'check'], [attention, 'info']]) {
    for (const message of messages) {
      const item = el('li', kind === 'info' ? 'attention' : '');
      item.append(icon(kind), el('span', '', message));
      list.append(item);
    }
  }
  output.replaceChildren(list);
}

function renderGuidance(entries, targets, day) {
  const confirmed = day?.complete === true;
  const guidance = confirmed ? dayGuidance(entries, targets) : null;
  const section = $('#guidance');
  section.hidden = !guidance;
  section.replaceChildren();
  if (guidance) {
    section.append(el('h3', '', guidance.title), el('p', 'small subtle', guidance.message));
    if (guidance.options.length) {
      const choices = el('ul', 'guidance-options');
      for (const { label, detail } of guidance.options) {
        const option = el('li');
        option.append(el('strong', '', label), el('span', 'small subtle', detail));
        choices.append(option);
      }
      section.append(choices);
    }
  }
  $('#day-check').hidden = entries.length === 0;
  $('#day-check-note').textContent = confirmed
    ? 'Journée confirmée. Ajouter ou modifier une entrée la rouvre.'
    : 'Quand tous tes repas et boissons sont saisis, termine la journée pour l’inclure dans le bilan de la semaine.';
  $('#confirm-day').textContent = confirmed ? 'Rouvrir la journée' : 'Terminer la journée';
}

function renderWeeklyOverview() {
  const { periodStart, periodEnd, recordedDays, confirmedDays, metrics: results } = weeklyOverview(journal.days, localDate());
  const output = $('#weekly-overview');
  output.replaceChildren(el('p', 'small subtle', formatDate(periodStart, { day: 'numeric', month: 'short' }) +
    ' au ' + formatDate(periodEnd, { day: 'numeric', month: 'short' }) + ' · ' + confirmedDays + '/7 jours confirmés'));
  if (!confirmedDays) {
    output.append(el('p', 'small weekly-note', recordedDays
      ? 'Confirme tes journées saisies pour voir les tendances.'
      : 'Tes journées confirmées apparaîtront ici au fil de la semaine.'));
    return;
  }
  const list = el('dl', 'weekly-metrics');
  for (const metric of results) {
    const row = el('div');
    const value = metric.average == null ? 'À compléter' : number.format(metric.average) + ' ' + metric.unit + '/j';
    const details = [metric.days + '/7 j comparables'];
    if (metric.averageTarget != null) details.push('repère moyen ' + number.format(metric.averageTarget) + ' ' + metric.unit);
    if (metric.belowDays > 0 && metric.key !== 'kcal') details.push(metric.belowDays + ' j sous le repère');
    if (metric.estimatedDays > 0) details.push(metric.estimatedDays + ' j avec estimations');
    const reading = el('dd');
    reading.append(el('strong', '', value), el('span', 'small subtle', details.join(' · ')));
    row.append(el('dt', '', metric.label), reading);
    list.append(row);
  }
  output.append(list);
  const repeatedGaps = results.filter(metric => metric.key !== 'kcal' && metric.days >= 3 && metric.belowDays * 2 > metric.days);
  if (repeatedGaps.length) {
    const labels = repeatedGaps.map(metric => metric.label.toLowerCase()).join(' et les ');
    output.append(el('p', 'small weekly-note', 'Sur la majorité des journées comparables, les apports sont sous le repère pour les ' +
      labels + '. Le bilan d’une journée confirmée propose des idées de portions.'));
  }
}

function renderEntry(entry) {
  const row = el('article', 'entry-row');
  const symbol = el('span', 'tile' + (entry.kind === 'drink' ? ' blue' : ''));
  symbol.append(icon(entry.kind === 'drink' ? 'drop' : 'meal'));
  const content = el('div');
  const titles = entry.items.map(item => item.name + ' (' +
    (item.unit === 'ml' ? volume(item.grams) : displayMetric('weight', item.grams)) + ')');
  const totals = aggregateEntries([entry]);
  const amounts = [
    displayMetric('kcal', knownTotal(totals, 'kcal')),
    ...metrics.slice(0, 3).map(metric => displayMetric(metric.key, knownTotal(totals, metric.key)) + ' ' + metric.label.toLowerCase()),
  ];
  content.append(el('h3', '', entry.label), el('p', 'entry-sub subtle', titles.join(', ')),
    el('p', 'entry-numbers', amounts.join(' · ') + (totals.unknown ? ' · valeurs partielles' : '') +
      (totals.estimated ? ' · portion estimée' : '')));
  const edit = button('', 'icon-button');
  edit.append(icon('edit'));
  edit.setAttribute('aria-label', 'Modifier ' + entry.label);
  edit.addEventListener('click', () => {
    const entryDate = date;
    openReview(entry, entryDate, edited => {
      const success = updateJournal(state => {
        const matching = state.days[entryDate]?.entries.find(candidate => candidate.id === entry.id);
        if (!matching) throw new Error('Entrée introuvable');
        Object.assign(matching, edited);
        delete state.days[entryDate].complete;
      });
      if (success) notify('Entrée modifiée.');
      return success;
    }, () => {
      const success = updateJournal(state => {
        const day = state.days[entryDate];
        if (!day) return;
        day.entries = day.entries.filter(current => current.id !== entry.id);
        delete day.complete;
      });
      if (success) notify('Entrée supprimée.');
      return success;
    });
  });
  row.append(symbol, content, edit);
  return row;
}

function renderJournal() {
  const today = localDate();
  const day = journal.days[date];
  const entries = day?.entries ?? [];
  const targets = date === today ? calculateTargets(journal.profile) ?? day?.targets : day?.targets;
  const totals = aggregateEntries(entries);
  $('#day-caption').textContent = (date === today ? 'Aujourd’hui, ' : '') + formatDate(date) +
    (date !== today && targets && !targets.ranges ? ' · Repères historiques' : '');
  dayPicker.value = date;
  dayPicker.max = today;
  $('#previous-day').disabled = date <= '1900-01-01';
  $('#next-day').disabled = date === today;
  $('#go-today').hidden = date === today;
  renderEnergy(totals, targets);
  $('#macros').replaceChildren(...metrics.map(metric => metricCard(metric, totals, targets)));
  $('#entry-count').textContent = entries.length;
  $('#entries').replaceChildren(...(entries.length ? [...entries].reverse().map(renderEntry) :
    [empty('Aucune entrée enregistrée pour cette journée.')]));
  renderSummary(entries, targets);
  renderGuidance(entries, targets, day);
}

function renderCalorieReview() {
  const section = $('#calorie-review');
  section.hidden = !journal.profile;
  if (!journal.profile) return;
  const review = calorieReview(journal.days, localDate(), journal.profile);
  section.replaceChildren(el('h3', '', 'Faire le point sur la cible calories'),
    el('p', 'small subtle', review.message));
  if (!review.suggestion) return;
  section.append(el('p', 'small', 'Cible à examiner · ' + displayMetric('kcal', review.suggestion.kcal) + '/jour (' +
    signed(review.suggestion.delta) + ' kcal).'));
  const preview = button('Voir l’ajustement dans mon profil', 'button compact');
  preview.addEventListener('click', () => {
    location.hash = 'profil';
    $('.advanced').open = true;
    const control = profileForm.elements.customCalories;
    control.value = review.suggestion.kcal;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => {
      control.focus();
      control.scrollIntoView({ block: 'center' });
    });
  });
  section.append(preview);
}

function renderHistory() {
  const dates = Object.keys(journal.days).sort().reverse();
  const recorded = dates.filter(dayKey => journal.days[dayKey].entries.length || journal.days[dayKey].weight != null);
  const weighIns = recorded.filter(dayKey => journal.days[dayKey].weight != null);
  const [latest, previous] = weighIns;
  const overview = $('#weight-overview');
  if (latest) {
    const current = journal.days[latest].weight;
    const variation = previous ? current - journal.days[previous].weight : null;
    const goal = journal.profile?.goalWeight;
    overview.replaceChildren(el('strong', 'weight-current', number.format(current) + ' kg'),
      el('p', 'small subtle', 'Dernière pesée le ' + formatDate(latest)));
    if (variation !== null) {
      const change = Math.round(variation * 10) / 10;
      const trend = weightTrend(journal.days, localDate());
      overview.append(el('p', 'small subtle', trend
        ? 'Tendance · ' + signed(Math.round(trend.delta * 10) / 10) + ' kg entre deux périodes de 14 jours (' +
          trend.previousCount + ' et ' + trend.latestCount + ' pesées)'
        : signed(change) + ' kg depuis la pesée précédente'));
    }
    if (goal != null) overview.append(el('p', 'small subtle', 'Poids visé · ' + number.format(goal) + ' kg'));
  } else {
    overview.replaceChildren(empty('Ajoute une pesée pour amorcer le suivi.'));
  }

  const rows = recorded.slice(0, historyLimit).map(dayKey => {
    const day = journal.days[dayKey];
    const totals = aggregateEntries(day.entries);
    const details = [];
    if (day.entries.length) {
      const kcal = knownTotal(totals, 'kcal');
      const energy = kcal == null ? 'Calories à compléter' : displayMetric('kcal', kcal) + (totals.missing.kcal ? ' (partiel)' : '');
      details.push(energy, volume(totals.water) + ' de boissons');
      if (day.complete) details.push('Journée confirmée');
    }
    if (day.weight != null) details.push(number.format(day.weight) + ' kg');
    const row = el('article', 'history-row');
    const content = el('div');
    const open = button('Voir la journée', 'button compact');
    open.addEventListener('click', () => {
      chooseDate(dayKey);
      location.hash = 'journal';
    });
    content.append(el('h3', '', formatDate(dayKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      el('p', 'small subtle', details.join(' · ')));
    row.append(content, open);
    return row;
  });
  $('#history-days').replaceChildren(...(rows.length ? rows : [empty('Les journées avec des entrées ou des pesées apparaîtront ici.')]));
  $('#more-history').hidden = recorded.length <= historyLimit;
  weightForm.elements.date.max = localDate();
  renderCalorieReview();
  renderWeeklyOverview();
}

function updateTrainingFields(selected = profileForm.elements.sportType.value) {
  const typedAge = profileForm.elements.age.valueAsNumber;
  const age = typedAge >= 18 && typedAge <= 110 ? typedAge : journal.profile?.age ?? 30;
  const type = profileForm.elements.sportType;
  const other = el('option', '', age < 19 ? 'Valeurs disponibles à partir de 19 ans' : 'Choisir une activité');
  other.value = '';
  type.replaceChildren(other);
  for (const [id, item] of Object.entries(SPORT_OPTIONS)) {
    if (sportMet(age, id) == null) continue;
    const option = el('option', '', item.label);
    option.value = id;
    type.append(option);
  }
  type.value = [...type.options].some(option => option.value === selected) ? selected : '';
  const active = profileForm.elements.sport.valueAsNumber > 0;
  $('#training-fields').hidden = !active;
  type.disabled = !active || age < 19;
  profileForm.elements.sportMinutes.disabled = type.disabled;
}

function updateGoalFields() {
  const mode = profileForm.elements.proteinMode.value;
  const fields = [
    ['deficit', '#deficit-field', profileForm.elements.goal.value === 'lose'],
    ['proteinPerKg', '#protein-rate-field', mode === 'training'],
    ['proteinGrams', '#protein-grams-field', mode === 'manual'],
  ];
  for (const [name, label, visible] of fields) {
    $(label).hidden = !visible;
    profileForm.elements[name].disabled = !visible;
  }
  profileForm.elements.proteinGrams.required = mode === 'manual';
}

function populateProfile() {
  profileForm.reset();
  profileDirty = false;
  const profile = journal.profile;
  $('.advanced').open = profile?.customCalories != null || profile?.water != null;
  for (const [key, value] of Object.entries(profile ?? {})) {
    const field = profileForm.elements.namedItem(key);
    if (field && value != null) field.value = value;
  }
  updateTrainingFields(profile?.sportType ?? '');
  updateGoalFields();
}

function renderProfileTargets(profile = journal.profile, preview = false) {
  const output = $('#profile-targets');
  const targets = calculateTargets(profile);
  if (!targets) {
    if (!preview) output.replaceChildren(empty('Enregistre ton profil pour calculer les repères.'));
    return;
  }
  const energy = energyPlan(profile);
  const list = el('dl', 'target-list');
  function addTarget(label, target) {
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', target));
    list.append(row);
  }
  addTarget('Cible énergie', displayMetric('kcal', targets.kcal));
  addTarget('Maintien estimé', displayMetric('kcal', energy.maintenance));
  const relativeChange = energy.difference / energy.maintenance * 100;
  const percent = Math.round(relativeChange * 10) / 10;
  addTarget('Écart avec le maintien', signed(energy.difference) + ' kcal' +
    (energy.difference ? ' (' + signed(percent) + ' %)' : ''));
  for (const metric of metrics) {
    const label = metric.key === 'water' && targets.ranges?.water ? 'Eau' : metric.label;
    addTarget(label, displayTarget(metric.key, targets));
  }
  output.replaceChildren(list);
  if (preview) output.prepend(el('p', 'small subtle', 'Aperçu des réglages avant enregistrement.'));
  const sportEnergy = sportCaloriesPerDay(profile);
  if (sportEnergy > 0) {
    output.append(el('p', 'small subtle target-notice', 'Sport compté dans le maintien · environ ' + displayMetric('kcal', sportEnergy) + ' par jour.'));
  }
  if (targets.proteinGoal != null) {
    const share = targets.proteinGoal * 4 / targets.kcal * 100;
    output.append(el('p', 'small subtle target-notice', 'La cible de protéines représente ' + number.format(share) +
      ' % de l’énergie. Les glucides correspondent au solde selon la part de lipides.'));
  }
  const notice = targetNotice(profile, targets, energy);
  if (notice) output.append(el('p', 'small subtle target-notice', notice));
}

function render() {
  renderJournal();
  renderHistory();
  if (!profileDirty) renderProfileTargets();
}

function storeEntry(entry, entryDate) {
  const success = updateJournal(state => {
    const day = ensureDay(state, entryDate);
    day.entries.push(entry);
    delete day.complete;
  });
  if (success) notify(entry.kind === 'drink' ? 'Boisson enregistrée.' : 'Repas enregistré.');
  return success;
}

function newEntry(kind, items, label) {
  return { id: crypto.randomUUID(), label, kind, items, at: new Date().toISOString() };
}

function setMode(nextMode) {
  mode = nextMode;
  for (const control of $$('[data-mode]')) control.setAttribute('aria-pressed', String(control.dataset.mode === mode));
  $('#text-entry').hidden = mode === 'photo';
  $('#photo-entry').hidden = mode !== 'photo';
  $('#entry-label').textContent = mode === 'drink' ? 'Décris tes boissons' : 'Décris ton repas';
  entryText.placeholder = mode === 'drink' ? '500 ml d’eau, café, 25 cl de jus d’orange' : '150 g de poulet, riz, 2 clémentines';
  $('#entry-tip').textContent = mode === 'drink' ? 'Sépare les boissons par des virgules.' : 'Sépare les ingrédients par des virgules.';
  for (const water of $$('[data-water]:not([data-water="250"])')) water.hidden = mode !== 'drink';
  $('#entry-error').hidden = true;
}

$('#entry-form').addEventListener('submit', event => {
  event.preventDefault();
  if (mode === 'photo') return;
  refreshToday();
  const items = parseMeal(entryText.value, mode === 'drink');
  if (!items.length) {
    const error = $('#entry-error');
    error.hidden = false;
    error.textContent = 'Ajoute au moins un ingrédient ou une boisson.';
    entryText.focus();
    return;
  }
  $('#entry-error').hidden = true;
  const entryDate = date;
  const originalText = entryText.value;
  openReview(newEntry(mode, items, ''), entryDate, entry => {
    const success = storeEntry(entry, entryDate);
    if (success && originalText === entryText.value) entryText.value = '';
    return success;
  });
});

$('#confirm-day').addEventListener('click', () => {
  refreshToday();
  const dayKey = date;
  const success = updateJournal(state => {
    const day = state.days[dayKey];
    if (!day?.entries.length) throw new Error('Aucune entrée');
    if (day.complete) delete day.complete;
    else day.complete = true;
  });
  if (success) notify(journal.days[dayKey].complete ? 'Journée confirmée.' : 'Journée rouverte.');
});
for (const control of $$('[data-water]')) {
  control.addEventListener('click', () => {
    refreshToday();
    const grams = Number(control.dataset.water);
    const water = { name: 'Eau', grams, unit: 'ml', estimated: false, source: '', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    storeEntry(newEntry('drink', [water], 'Eau'), date);
  });
}
for (const control of $$('[data-mode]')) control.addEventListener('click', () => setMode(control.dataset.mode));

function selectPhoto(photo) {
  selectedPhoto = photo;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = photo ? URL.createObjectURL(photo) : null;
  photoPreview.hidden = !photo;
  if (photoUrl) photoPreview.src = photoUrl;
  else photoPreview.removeAttribute('src');
  photoAnalyze.disabled = !photo;
  photoAnalyze.hidden = !photo;
  $('#clear-photo').hidden = !photo;
  const additions = $('#photo-additions');
  additions.hidden = !photo;
  if (!photo) {
    photoText.value = '';
    additions.open = false;
  }
  photoStatus.textContent = '';
  photoResults.replaceChildren();
}

photoFile.addEventListener('change', () => selectPhoto(photoFile.files[0]));
$('#choose-photo').addEventListener('click', () => photoFile.click());
$('#clear-photo').addEventListener('click', () => {
  photoFile.value = '';
  selectPhoto(null);
});
$('#capture-photo').addEventListener('click', () => cameraFile.click());
cameraFile.addEventListener('change', () => {
  const photo = cameraFile.files[0];
  if (!photo) return;
  photoFile.value = '';
  selectPhoto(photo);
  cameraFile.value = '';
});
photoPreview.addEventListener('error', () => { photoPreview.hidden = true; });
photoAnalyze.addEventListener('click', async () => {
  const file = selectedPhoto;
  if (!file) return;
  photoAnalyze.disabled = true;
  photoResults.replaceChildren();
  photoStatus.textContent = 'Préparation de l’analyse…';
  try {
    const { analyzePhoto } = await import('./plate-vision.mjs');
    const suggestions = await analyzePhoto(file, status => {
      if (file === selectedPhoto) photoStatus.textContent = status;
    });
    if (file !== selectedPhoto) return;
    if (!suggestions.length) {
      photoStatus.textContent = 'Aucun aliment reconnu avec assez de confiance. Tu peux décrire ton repas.';
      return;
    }
    photoStatus.textContent = 'Aliments proposés · ' + suggestions.map(({ name }) => name).join(', ') +
      '. Vérifie les poids et ajoute les ingrédients cachés.';
    const review = button('Vérifier les aliments et les portions', 'button filled');
    review.addEventListener('click', () => {
      refreshToday();
      const photoDate = date;
      const manualItems = parseMeal(photoText.value);
      const manualNames = new Set(manualItems.map(item => item.name.toLocaleLowerCase('fr')));
      const photoItems = suggestions.flatMap(({ name, grams }) => parseMeal(name)
        .filter(item => !manualNames.has(item.name.toLocaleLowerCase('fr')))
        .map(item => ({
          ...item,
          name,
          grams: Number.isFinite(grams) && grams > 0 ? grams : item.grams,
          estimated: true,
          source: 'Photo · ' + (item.name === name ? '' : 'Réf. ' + item.name + ' · ') + item.source,
        })));
      openReview(newEntry('meal', [...photoItems, ...manualItems], 'Repas'), photoDate, entry => {
        const success = storeEntry(entry, photoDate);
        if (success) {
          photoFile.value = '';
          selectPhoto(null);
        }
        return success;
      });
    });
    photoResults.append(review);
  } catch (error) {
    if (file === selectedPhoto) photoStatus.textContent = (error.message || 'Analyse indisponible.') + ' Tu peux décrire ton repas à la main.';
  } finally {
    if (file === selectedPhoto) photoAnalyze.disabled = false;
  }
});

function readProfileForm() {
  const profile = Object.fromEntries(new FormData(profileForm));
  profile.name = profile.name.trim();
  for (const field of ['age', 'height', 'weight', 'sport', 'sportMinutes', 'goalWeight', 'water', 'customCalories',
    'deficit', 'proteinPerKg', 'proteinGrams']) {
    const rememberWhenHidden = ['deficit', 'proteinPerKg', 'proteinGrams'].includes(field);
    const value = rememberWhenHidden && profileForm.elements[field].disabled
      ? journal.profile?.[field] : profile[field];
    profile[field] = value == null || value === '' ? null : Number(value);
  }
  profile.sportType ||= null;
  return profile;
}

profileForm.addEventListener('input', event => {
  profileDirty = true;
  if (['age', 'sport'].includes(event.target.name)) updateTrainingFields();
  if (['goal', 'proteinMode'].includes(event.target.name)) updateGoalFields();
  if (profileForm.matches(':valid')) renderProfileTargets(readProfileForm(), true);
});
profileForm.addEventListener('submit', event => {
  event.preventDefault();
  refreshToday();
  const profile = readProfileForm();
  const targets = calculateTargets(profile);
  const status = $('#profile-status');
  if (!targets) { status.textContent = 'Vérifie les informations saisies.'; return; }
  if (profile.proteinMode !== 'general' && targets.proteinGoal == null) {
    status.textContent = targetNotice(profile, targets);
    return;
  }
  const success = updateJournal(state => {
    const firstWeight = state.profile?.weight !== profile.weight || Object.values(state.days).every(day => day.weight == null);
    state.profile = profile;
    const today = ensureDay(state, localDate());
    if (firstWeight) today.weight = profile.weight;
  });
  if (success) {
    profileDirty = false;
    renderProfileTargets();
  }
  status.textContent = success ? 'Profil et repères enregistrés.' : 'Le profil n’a pas pu être enregistré.';
});

weightForm.addEventListener('submit', event => {
  event.preventDefault();
  const dayKey = weightForm.elements.date.value;
  if (!validDay(dayKey)) { notify('Choisis une date valide.'); return; }
  const weight = weightForm.elements.weight.valueAsNumber;
  const success = updateJournal(state => {
    ensureDay(state, dayKey).weight = weight;
    const newerWeighIn = Object.entries(state.days).some(([key, day]) => key > dayKey && day.weight != null);
    if (!newerWeighIn && state.profile) {
      state.profile.weight = weight;
      ensureDay(state, localDate());
    }
  });
  if (success) {
    if (!profileDirty) populateProfile();
    weightForm.elements.weight.value = '';
    notify('Pesée enregistrée.');
  }
});
$('#more-history').addEventListener('click', () => { historyLimit += 14; renderHistory(); });

function backupFile() {
  return new File([exportJournal(journal)], 'assiette-' + localDate() + '.json', { type: 'application/json' });
}

function downloadBackup(file) {
  const url = URL.createObjectURL(file);
  const link = el('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify('Sauvegarde exportée.');
}

$('#save-file').addEventListener('click', async () => {
  try {
    const file = backupFile();
    const files = [file];
    if (!navigator.share || !navigator.canShare?.({ files })) {
      downloadBackup(file);
      return;
    }
    await navigator.share({ files });
  } catch (error) {
    if (error.name !== 'AbortError') {
      try { downloadBackup(backupFile()); }
      catch { notify('Impossible d’enregistrer une copie sur cet appareil.'); }
    }
  }
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('La sauvegarde dépasse 20 Mo.');
    const restored = importJournal(await file.text());
    const hasData = journal.profile || Object.keys(journal.days).length;
    const days = Object.keys(restored.days).length;
    if (hasData && !confirm('Cette copie contient ' + days + ' ' + (days === 1 ? 'journée' : 'journées') +
      '. Remplacer le journal et le profil actuels par cette copie ?')) return;
    restoreJournal(restored);
    cloudBackup.changed();
    notify('Sauvegarde importée.');
  } catch (error) {
    notify('Import impossible. ' + (error.message || 'Vérifie le fichier.'));
  } finally {
    event.target.value = '';
  }
});

function showBackupStatus({ connected, blocked, busy, phase, message }) {
  const status = $('#backup-status');
  const indicator = $('#backup-indicator');
  status.textContent = message;
  status.classList.toggle('error', phase === 'error');
  indicator.textContent = {
    saved: 'Sauvegardé sur GitHub',
    pending: blocked ? 'Sauvegarde à vérifier' : 'Sauvegarde en attente',
    working: 'Sauvegarde en cours…',
    error: 'Sauvegarde à vérifier',
  }[phase] ?? 'Sauvegarde';
  $('#backup-setup').hidden = connected;
  $('#backup-controls').hidden = !connected;
  $('#backup-now').hidden = blocked;
  $('#backup-local').hidden = !blocked;
  backupForm.querySelector('button[type=submit]').disabled = busy;
  for (const control of $$('#backup-controls button')) control.disabled = busy;
  if (connected) backupForm.reset();
}

const cloudBackup = createBackupSync({ getJournal: loadJournal, restoreJournal, report: showBackupStatus });
backupForm.addEventListener('submit', event => {
  event.preventDefault();
  void cloudBackup.connect(backupForm.elements.token.value.trim(), backupForm.elements.password.value);
});
$('#backup-now').addEventListener('click', () => { void cloudBackup.sync(); });
$('#backup-restore').addEventListener('click', () => {
  const hasData = journal.profile || Object.keys(journal.days).length;
  if (!hasData || confirm('Remplacer le journal et le profil de cet appareil par la copie GitHub ?')) {
    void cloudBackup.restore();
  }
});
$('#backup-local').addEventListener('click', () => {
  if (confirm('Sauvegarder le journal de cet appareil comme dernière version sur GitHub ?')) {
    void cloudBackup.keepLocal();
  }
});
$('#backup-disconnect').addEventListener('click', () => { void cloudBackup.disconnect(); });

$('#previous-day').addEventListener('click', () => chooseDate(shiftDate(date, -1)));
$('#next-day').addEventListener('click', () => chooseDate(shiftDate(date, 1)));
$('#go-today').addEventListener('click', () => {
  chooseDate(localDate());
  $('#date-menu').open = false;
  $('#date-menu summary').focus();
});
$('#date-menu').addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  $('#date-menu').open = false;
  $('#date-menu summary').focus();
});
dayPicker.addEventListener('change', () => {
  if (!validDay(dayPicker.value)) {
    dayPicker.value = date;
    return;
  }
  chooseDate(dayPicker.value);
  $('#date-menu').open = false;
  $('#date-menu summary').focus();
});
window.addEventListener('hashchange', () => showPage(true));
window.addEventListener('storage', event => {
  if (event.key !== 'assiette-journal-v1' && event.key !== null) return;
  readJournal();
  if (!profileDirty) populateProfile();
  render();
  cloudBackup.changed();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshToday();
    cloudBackup.changed();
  }
});
window.addEventListener('online', () => { void cloudBackup.sync(); });
window.addEventListener('focus', refreshToday);
setInterval(refreshToday, 30000);

weightForm.elements.date.value = lastToday;
readJournal();
populateProfile();
render();
showPage();
void cloudBackup.initialize();
void prepareOffline({
  status: $('#offline-status'),
  notice: $('#app-update'),
  activate: $('#install-update'),
  canReload: () => !profileDirty && !entryText.value.trim() && !selectedPhoto && !$('#entry-dialog').open &&
    !weightForm.elements.weight.value && !backupForm.elements.token.value && !backupForm.elements.password.value,
  warn: () => notify('Enregistre ou ferme la saisie en cours avant la mise à jour.'),
});
