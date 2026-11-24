import { $, el, icon, button, number } from './ui.mjs';
import { aggregateEntries, formatDate, knownTotal } from './journal.mjs?v=suivi-2';
import { findFoodReference, lookupProducts } from './nutrition.mjs?v=suivi-2';
import { searchCiqualFoods } from './ciqual-search.mjs?v=suivi-2';

const dialog = $('#entry-dialog');
const reviewForm = $('#review-form');
const reviewItems = $('#review-items');
const reviewLabel = $('#review-label');
const reviewTotal = $('#review-total');
const saveButton = $('#save-entry');
const reviewError = $('#review-error');
const lookups = new Set();
const nutrients = { kcal: 'kcal', protein: 'Protéines (g)', carbs: 'Glucides (g)', fat: 'Lipides (g)', fiber: 'Fibres (g)' };
const mainNutrients = ['kcal', 'protein', 'carbs', 'fat'];
let draft;

function field(label, input) {
  const wrapper = el('label', 'field', label);
  wrapper.append(input);
  return wrapper;
}

function input(type, value, attributes = {}) {
  const control = el('input');
  control.type = type;
  if (value != null) control.value = value;
  for (const [name, value] of Object.entries(attributes)) control.setAttribute(name, value);
  return control;
}

function renderTotal() {
  const totals = aggregateEntries([draft.entry]);
  const values = Object.entries({ kcal: 'kcal', protein: 'g prot.', carbs: 'g gluc.', fat: 'g lip.', fiber: 'g fibres' }).map(([key, suffix]) => {
    const value = knownTotal(totals, key);
    return (value == null ? '—' : number.format(key === 'kcal' ? Math.round(value) : value)) + ' ' + suffix;
  });
  reviewTotal.textContent = values.join(' · ') + (totals.unknown ? ' · total partiel' : '') +
    (totals.missing.fiber && totals.missing.fiber < totals.items ? ' · fibres partielles' : '');
  saveButton.disabled = !draft.entry.items.length;
}

function resultOption(food) {
  const option = button(food.name, 'button compact result-option');
  const energy = food.kcal == null ? 'Énergie inconnue' : `${number.format(food.kcal)} kcal / 100 ${food.unit ?? 'g/ml'}`;
  const details = [energy, food.barcode, food.unit == null ? 'unité à vérifier' : ''].filter(Boolean);
  option.append(el('small', '', details.join(' · ')));
  return option;
}

function ciqualLookup(item, choose) {
  const details = el('details', 'lookup');
  const query = input('search', item.query || item.name, { maxlength: '160', placeholder: 'Aliment ou plat', enterkeyhint: 'search' });
  const search = button('Chercher dans Ciqual', 'button compact');
  search.prepend(icon('search'));
  const status = el('p', 'small subtle');
  status.setAttribute('role', 'status');
  const results = el('div', 'lookup-results');
  let initialTerm = query.value;

  function lookup() {
    const term = query.value.trim();
    results.replaceChildren();
    if (term.length < 2) {
      status.textContent = 'Entre au moins deux caractères.';
      return;
    }
    const foods = searchCiqualFoods(term);
    status.textContent = foods.length ? 'Choisis la préparation qui correspond.' : 'Essaie un nom plus simple ou saisis les valeurs de ton plat.';
    for (const food of foods) {
      const option = resultOption(food);
      option.addEventListener('click', () => {
        const unitChanged = choose(food);
        results.replaceChildren();
        status.textContent = unitChanged ? 'Renseigne le poids en grammes.' : 'Valeurs Ciqual utilisées.';
        if (!unitChanged) details.open = false;
      });
      results.append(option);
    }
  }

  details.addEventListener('toggle', () => {
    if (!details.open) return;
    const currentTerm = item.query || item.name;
    if (query.value === initialTerm && query.value !== currentTerm) {
      query.value = currentTerm;
      initialTerm = currentTerm;
      status.textContent = '';
      results.replaceChildren();
    }
    if (!status.textContent && query.value.trim().length >= 2) lookup();
  });
  query.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    lookup();
  });
  search.addEventListener('click', lookup);
  details.append(el('summary', '', 'Chercher un aliment ou un plat dans Ciqual'), field('Nom de l’aliment ou du plat', query), search, status, results);
  return details;
}

function productLookup(item, refresh) {
  const details = el('details', 'lookup');
  const query = input('search', item.query || item.name, { maxlength: '120', placeholder: 'Marque, produit ou code-barres', enterkeyhint: 'search' });
  const search = button('Rechercher', 'button compact');
  search.prepend(icon('search'));
  const results = el('div', 'lookup-results');
  const status = el('p', 'small subtle');
  status.setAttribute('role', 'status');

  function offerSearchPage(searchText) {
    const url = new URL('https://fr.openfoodfacts.org/cgi/search.pl');
    url.search = new URLSearchParams({ search_terms: searchText, search_simple: '1', action: 'process' });
    const link = el('a', 'button compact', 'Chercher sur Open Food Facts');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    results.append(link);
  }

  async function lookup() {
    if (search.disabled) return;
    const searchText = query.value.trim();
    if (searchText.length < 2) {
      status.textContent = 'Entre au moins deux caractères.';
      return;
    }
    const request = new AbortController();
    lookups.add(request);
    const timeout = setTimeout(() => request.abort(), 12000);
    search.disabled = true;
    status.textContent = 'Recherche en cours…';
    results.replaceChildren();
    try {
      const products = await lookupProducts(searchText, request.signal);
      status.textContent = products.length ? 'Vérifie la marque, le code-barres et les valeurs sur l’emballage.' : 'Aucun produit trouvé. Essaie le code-barres ou saisis les valeurs de l’étiquette.';
      if (!products.length) offerSearchPage(searchText);
      for (const product of products) {
        const option = resultOption(product);
        option.addEventListener('click', () => {
          const unitChanged = product.unit && product.unit !== item.unit;
          const { name, kcal, protein, carbs, fat, fiber, source, barcode } = product;
          Object.assign(item, { name, kcal, protein, carbs, fat, fiber, source, query: name, barcode });
          if (unitChanged) {
            item.unit = product.unit;
            item.grams = null;
            item.estimated = false;
            status.textContent = `L’unité a changé. Renseigne la quantité en ${product.unit}.`;
          } else {
            status.textContent = 'Vérifie les valeurs avec l’étiquette, surtout si la recette a changé.';
          }
          results.replaceChildren();
          refresh(unitChanged);
          renderTotal();
        });
        results.append(option);
      }
    } catch {
      if (dialog.open) {
        status.textContent = 'Recherche indisponible. Essaie le code-barres ou saisis les valeurs de l’étiquette.';
        offerSearchPage(searchText);
      }
    } finally {
      clearTimeout(timeout);
      lookups.delete(request);
      search.disabled = false;
    }
  }

  query.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void lookup();
    }
  });
  search.addEventListener('click', lookup);
  details.append(el('summary', '', 'Chercher un produit de marque'), el('p', 'small subtle', 'Seul ce terme de recherche est envoyé à Open Food Facts.'), field('Nom ou code-barres', query), search, status, results);
  return details;
}

function itemEditor(item, index) {
  const editor = el('fieldset', 'review-item');
  const fields = el('div', 'review-fields');
  const name = input('text', item.name, { required: '', maxlength: '160' });
  const quantity = input('number', item.grams, { required: '', min: '0.01', max: '100000', step: 'any', inputmode: 'decimal' });
  const unit = el('select');
  for (const unitName of ['g', 'ml']) {
    const option = el('option', '', unitName);
    option.value = unitName;
    unit.append(option);
  }
  const remove = button('', 'icon-button');
  remove.setAttribute('aria-label', 'Retirer l’ingrédient ' + (index + 1));
  remove.append(icon('close'));
  const metadata = el('p', 'small subtle review-meta');
  const details = el('details');
  const detailTitle = el('summary');
  const nutrientFields = el('div', 'nutrient-fields');
  const nutrientInputs = {};
  let referenceName = item.name.trim();

  function refreshMetadata() {
    detailTitle.textContent = 'Valeurs pour 100 ' + item.unit;
    const incomplete = mainNutrients.some(key => item[key] == null);
    metadata.textContent = [
      item.estimated ? 'Portion estimée' : '',
      item.source,
      incomplete ? 'Valeurs à compléter' : item.fiber == null ? 'Fibres inconnues' : '',
    ].filter(Boolean).join(' · ');
    if (item.barcode) {
      const link = el('a', '', 'Vérifier la fiche du produit');
      link.href = `https://world.openfoodfacts.org/product/${item.barcode}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      metadata.append(' · ', link);
    }
  }

  function refresh() {
    name.value = item.name;
    quantity.value = item.grams ?? '';
    unit.value = item.unit;
    for (const key of Object.keys(nutrients)) nutrientInputs[key].value = item[key] ?? '';
    refreshMetadata();
  }

  function applyCiqual(food) {
    const unitChanged = item.unit !== food.unit;
    const { name: foodName, kcal, protein, carbs, fat, fiber, source, unit: foodUnit } = food;
    Object.assign(item, { name: foodName, query: foodName, kcal, protein, carbs, fat, fiber, source, unit: foodUnit });
    delete item.barcode;
    if (unitChanged) {
      item.grams = null;
      item.estimated = false;
    }
    referenceName = item.name.trim();
    name.setCustomValidity('');
    refresh();
    renderTotal();
    if (unitChanged) quantity.focus();
    return unitChanged;
  }

  name.addEventListener('input', () => {
    item.name = name.value;
    item.query = name.value;
    name.setCustomValidity(name.value.trim() ? '' : 'Renseigne le nom de l’ingrédient.');
  });
  name.addEventListener('change', () => {
    const fromPhoto = item.source.startsWith('Photo · ');
    const canRecalculate = fromPhoto || item.source.startsWith('Ciqual') || item.source === 'À renseigner' || !item.source;
    if (item.name.trim() === referenceName || !canRecalculate) return;
    referenceName = item.name.trim();
    const replacement = findFoodReference(referenceName, item.unit);
    for (const key of Object.keys(nutrients)) item[key] = replacement?.[key] ?? null;
    item.source = (fromPhoto ? 'Photo · ' : '') + (replacement?.source || 'À renseigner');
    refresh();
    renderTotal();
  });
  quantity.addEventListener('input', () => {
    item.grams = quantity.valueAsNumber || null;
    item.estimated = false;
    refreshMetadata();
    renderTotal();
  });
  unit.addEventListener('change', () => {
    item.unit = unit.value;
    item.estimated = true;
    for (const key of Object.keys(nutrients)) item[key] = null;
    item.source = '';
    delete item.barcode;
    refresh();
    details.open = true;
    renderTotal();
  });
  remove.addEventListener('click', () => {
    const itemIndex = draft.entry.items.indexOf(item);
    draft.entry.items.splice(itemIndex, 1);
    renderEditors();
    renderTotal();
  });
  for (const [key, caption] of Object.entries(nutrients)) {
    const control = input('number', item[key], { min: '0', max: key === 'kcal' ? '1000' : '100', step: 'any', inputmode: 'decimal', placeholder: '—' });
    nutrientInputs[key] = control;
    control.addEventListener('input', () => {
      item[key] = Number.isFinite(control.valueAsNumber) ? control.valueAsNumber : null;
      item.source = 'Valeurs ajustées';
      renderTotal();
    });
    control.addEventListener('change', refreshMetadata);
    nutrientFields.append(field(caption, control));
  }
  fields.append(field('Aliment ou boisson', name), field('Quantité', quantity), field('Unité', unit), remove);
  details.append(detailTitle, nutrientFields);
  editor.append(el('legend', '', 'Ingrédient ' + (index + 1)), fields, metadata, details, ciqualLookup(item, applyCiqual), productLookup(item, unitChanged => {
    name.setCustomValidity('');
    referenceName = item.name.trim();
    refresh();
    if (unitChanged) quantity.focus();
  }));
  refresh();
  return editor;
}

function renderEditors() {
  for (const lookup of lookups) lookup.abort();
  reviewItems.replaceChildren(...draft.entry.items.map(itemEditor));
}

$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  for (const lookup of lookups) lookup.abort();
  draft = null;
});
$('#add-ingredient').addEventListener('click', () => {
  const unit = draft.entry.kind === 'drink' ? 'ml' : 'g';
  draft.entry.items.push({ name: '', grams: 100, unit, estimated: true, source: '', kcal: null, protein: null, carbs: null, fat: null, fiber: null });
  renderEditors();
  renderTotal();
  reviewItems.lastElementChild.querySelector('input').focus();
});
$('#delete-entry').addEventListener('click', () => {
  if (!confirm('Supprimer cette entrée du journal ?')) return;
  if (draft.remove()) dialog.close();
  else showSaveError();
});
reviewForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!draft.entry.items.length) return;
  const label = reviewLabel.value.trim();
  draft.entry.label = label || (draft.entry.kind === 'drink' ? 'Boisson' : 'Repas');
  if (draft.save(draft.entry)) dialog.close();
  else showSaveError();
});

function showSaveError() {
  reviewError.hidden = false;
  reviewError.textContent = 'Impossible de mettre à jour le journal. Vérifie le stockage du navigateur.';
}

function fillMissingReference(item) {
  const unidentified = item.kcal == null && ['', 'À renseigner', 'Photo · À renseigner'].includes(item.source);
  const fromCiqual = item.source.includes('Ciqual 2025');
  if (!unidentified && (!fromCiqual || item.fiber != null)) return;
  const reference = findFoodReference(item.name, item.unit);
  if (!reference) return;
  if (unidentified) {
    if (reference.kcal == null) return;
    for (const key of Object.keys(nutrients)) item[key] ??= reference[key];
    item.source = (item.source.startsWith('Photo · ') ? 'Photo · ' : '') + reference.source;
  } else if (reference.source === 'Ciqual 2025' && mainNutrients.every(key => (item[key] ?? null) === reference[key])) {
    item.fiber = reference.fiber;
  }
}

export function openReview(entry, date, save, remove = null) {
  draft = { entry: structuredClone(entry), save, remove };
  if (remove) draft.entry.items.forEach(fillMissingReference);
  reviewError.hidden = true;
  $('#review-title').textContent = remove ? 'Modifier l’entrée' : 'Vérifier l’entrée';
  $('#review-date').textContent = formatDate(date);
  $('#delete-entry').hidden = !remove;
  reviewLabel.value = entry.label;
  renderEditors();
  renderTotal();
  dialog.showModal();
}
