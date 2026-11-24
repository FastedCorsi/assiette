import { $, $$, el, icon, button, empty, number, volume } from './ui.mjs';
import { parseMeal } from './nutrition.mjs';
import { openReview } from './review.mjs';
import { createBackupSync } from './backup-sync.mjs';
import { SPORT_OPTIONS, sportCaloriesPerDay, sportMet } from './activity.mjs';
import {
  calculateTargets, targetNotice, localDate, shiftDate, formatDate, aggregateEntries,
  summarizeDay, loadJournal, saveJournal, exportJournal, importJournal,
} from './journal.mjs';

const metrics = [
  { key: 'protein', label: 'Protéines', color: '#397d5b' },
  { key: 'carbs', label: 'Glucides', color: '#b78138' },
  { key: 'fat', label: 'Lipides', color: '#87639c' },
  { key: 'water', label: 'Boissons', color: '#4782a0' },
];
const pageNames = ['journal', 'historique', 'profil'];
const profileForm = $('#profile-form');
const dayPicker = $('#day-picker');
const entryText = $('#entry-text');
const photoFile = $('#photo-file');
const cameraFile = $('#camera-file');
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
  const page = pageNames.includes(requestedPage) ? requestedPage : 'journal';
  for (const name of pageNames) $('#' + name).hidden = name !== page;
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (scroll) window.scrollTo({ top: 0 });
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
  if (key === 'water') return volume(amount);
  if (key === 'kcal') return number.format(Math.round(amount)) + ' kcal';
  return number.format(amount) + ' g';
}

function displayTarget(key, targets) {
  const range = targets.ranges?.[key];
  if (!range) return displayMetric(key, targets[key]);
  if (key === 'water') return number.format(range[0] / 1000) + '–' + number.format(range[1] / 1000) + ' L';
  return number.format(range[0]) + '–' + number.format(range[1]) + ' g';
}

function metricCard(metric, totals, targets) {
  const { key, label, color } = metric;
  const card = el('section', 'macro-card');
  const countsPlainWater = key === 'water' && Boolean(targets?.ranges?.water);
  const title = el('h2', 'macro-label', countsPlainWater ? 'Eau' : label);
  const value = el('div', 'macro-value');
  const amount = countsPlainWater ? totals.plainWater : totals[key];
  const measured = el('strong', '', displayMetric(key, amount));
  const target = targets?.[key];
  const isPartial = Boolean(totals.missing[key]);
  card.style.setProperty('--track-fill', color);
  value.append(measured, el('span', '', (target ? ' / ' + displayTarget(key, targets) : '') + (isPartial ? ' · partiel' : '')));
  const meter = el('div', 'meter');
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Progression ' + title.textContent.toLowerCase());
  meter.append(el('span'));
  updateMeter(meter, amount, target, isPartial);
  card.append(title, value, meter);
  if (countsPlainWater) card.append(el('p', 'subtle macro-note', volume(totals.water) + ' de boissons au total'));
  return card;
}

function renderEnergy(totals, targets) {
  const energy = $('#energy');
  const note = $('#energy-note');
  const incomplete = totals.missing.kcal > 0;
  energy.replaceChildren(el('strong', '', number.format(Math.round(totals.kcal))),
    el('span', '', targets ? '/ ' + displayMetric('kcal', targets.kcal) : 'kcal'));
  updateMeter($('#energy-meter'), totals.kcal, targets?.kcal, incomplete);
  if (incomplete) {
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

function renderEntry(entry) {
  const row = el('article', 'entry-row');
  const symbol = el('span', 'tile' + (entry.kind === 'drink' ? ' blue' : ''));
  symbol.append(icon(entry.kind === 'drink' ? 'drop' : 'meal'));
  const content = el('div');
  const titles = entry.items.map(item => item.name + ' (' +
    (item.unit === 'ml' ? volume(item.grams) : displayMetric('weight', item.grams)) + ')');
  const totals = aggregateEntries([entry]);
  const amounts = [
    displayMetric('kcal', totals.kcal),
    ...metrics.slice(0, 3).map(metric => displayMetric(metric.key, totals[metric.key]) + ' ' + metric.label.toLowerCase()),
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
      });
      if (success) notify('Entrée modifiée.');
      return success;
    }, () => {
      const success = updateJournal(state => {
        const day = state.days[entryDate];
        if (!day) return;
        day.entries = day.entries.filter(current => current.id !== entry.id);
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
      overview.append(el('p', 'small subtle', (change > 0 ? '+' : '') + number.format(change) + ' kg depuis la pesée précédente'));
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
      details.push(displayMetric('kcal', totals.kcal) + (totals.missing.kcal ? ' (partiel)' : ''), volume(totals.water) + ' de boissons');
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
}

function renderProfileTargets() {
  const output = $('#profile-targets');
  const targets = calculateTargets(journal.profile);
  if (!targets) {
    output.replaceChildren(empty('Enregistre ton profil pour calculer les repères.'));
    return;
  }
  const list = el('dl', 'target-list');
  for (const metric of [{ key: 'kcal', label: 'Énergie' }, ...metrics]) {
    const row = el('div');
    const label = metric.key === 'water' && targets.ranges?.water ? 'Eau' : metric.label;
    row.append(el('dt', '', label), el('dd', '', displayTarget(metric.key, targets)));
    list.append(row);
  }
  output.replaceChildren(list);
  const sportEnergy = sportCaloriesPerDay(journal.profile);
  if (sportEnergy > 0 && journal.profile.customCalories == null) {
    output.append(el('p', 'small subtle target-notice', 'Sport compté · environ ' + displayMetric('kcal', sportEnergy) + ' par jour en moyenne.'));
  }
  const notice = targetNotice(journal.profile, targets);
  if (notice) output.append(el('p', 'small subtle target-notice', notice));
}

function render() {
  renderJournal();
  renderHistory();
  renderProfileTargets();
}

function storeEntry(entry, entryDate) {
  const success = updateJournal(state => { ensureDay(state, entryDate).entries.push(entry); });
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
  entryText.placeholder = mode === 'drink' ? '500 ml d’eau, café, 25 cl de jus d’orange' : '150 g de poulet, riz cuit, 1/2 avocat';
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

for (const control of $$('[data-water]')) {
  control.addEventListener('click', () => {
    refreshToday();
    const grams = Number(control.dataset.water);
    const water = { name: 'Eau', grams, unit: 'ml', estimated: false, source: '', kcal: 0, protein: 0, carbs: 0, fat: 0 };
    storeEntry(newEntry('drink', [water], 'Eau'), date);
  });
}
for (const control of $$('[data-mode]')) control.addEventListener('click', () => setMode(control.dataset.mode));
$('#example').addEventListener('click', () => {
  if (!entryText.value.trim()) entryText.value = entryText.placeholder;
  entryText.focus();
});
$('#photo-to-text').addEventListener('click', () => { setMode('meal'); entryText.focus(); });

function selectPhoto(photo) {
  selectedPhoto = photo;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = photo ? URL.createObjectURL(photo) : null;
  photoPreview.hidden = !photo;
  if (photoUrl) photoPreview.src = photoUrl;
  else photoPreview.removeAttribute('src');
  photoAnalyze.disabled = !photo;
  photoStatus.textContent = '';
  photoResults.replaceChildren();
}

photoFile.addEventListener('change', () => selectPhoto(photoFile.files[0]));
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
    photoStatus.textContent = 'Aliments proposés · ' + suggestions.map(({ name }) => name).join(', ');
    const review = button('Vérifier les aliments et les portions', 'button filled');
    review.addEventListener('click', () => {
      refreshToday();
      const photoDate = date;
      const description = entryText.value;
      const manualItems = parseMeal(description);
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
          if (description === entryText.value) entryText.value = '';
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

profileForm.addEventListener('input', () => { profileDirty = true; });
for (const field of ['age', 'sport']) {
  profileForm.elements[field].addEventListener('input', () => updateTrainingFields());
}
profileForm.addEventListener('submit', event => {
  event.preventDefault();
  refreshToday();
  const profile = Object.fromEntries(new FormData(profileForm));
  profile.name = profile.name.trim();
  for (const field of ['age', 'height', 'weight', 'sport', 'sportMinutes', 'goalWeight', 'water', 'customCalories']) {
    profile[field] = profile[field] == null || profile[field] === '' ? null : Number(profile[field]);
  }
  profile.sportType ||= null;
  const targets = calculateTargets(profile);
  const status = $('#profile-status');
  if (!targets) { status.textContent = 'Vérifie les informations saisies.'; return; }
  const success = updateJournal(state => {
    const firstWeight = state.profile?.weight !== profile.weight || Object.values(state.days).every(day => day.weight == null);
    state.profile = profile;
    const today = ensureDay(state, localDate());
    if (firstWeight) today.weight = profile.weight;
  });
  if (success) profileDirty = false;
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

$('#export-data').addEventListener('click', () => {
  try {
    downloadBackup(backupFile());
  } catch {
    notify('Export impossible.');
  }
});
$('#share-data').hidden = typeof navigator.share !== 'function';
$('#share-data').addEventListener('click', async () => {
  try {
    const file = backupFile();
    const files = [file];
    if (!navigator.canShare?.({ files })) {
      downloadBackup(file);
      return;
    }
    await navigator.share({ files });
  } catch (error) {
    if (error.name !== 'AbortError') notify('Partage impossible. Essaie le bouton Exporter.');
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
    if (hasData && !confirm('Remplacer le journal et le profil actuels par cette sauvegarde ?')) return;
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
  indicator.hidden = !connected;
  indicator.textContent = {
    saved: 'Sauvegardé sur GitHub',
    pending: blocked ? 'Sauvegarde à vérifier' : 'Sauvegarde en attente',
    working: 'Sauvegarde en cours…',
    error: 'Sauvegarde à vérifier',
  }[phase] ?? '';
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
$('#go-today').addEventListener('click', () => chooseDate(localDate()));
dayPicker.addEventListener('change', () => chooseDate(dayPicker.value));
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
