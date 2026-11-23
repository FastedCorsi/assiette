import { $, el, icon, button, number } from './ui.mjs';
import { aggregateEntries, formatDate } from './journal.mjs';
import { lookupProducts } from './nutrition.mjs';

const dialog = $('#entry-dialog');
const reviewForm = $('#review-form');
const reviewItems = $('#review-items');
const reviewLabel = $('#review-label');
const reviewTotal = $('#review-total');
const saveButton = $('#save-entry');
const reviewError = $('#review-error');
const lookups = new Set();
const nutrients = { kcal: 'kcal', protein: 'Protéines (g)', carbs: 'Glucides (g)', fat: 'Lipides (g)' };
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
  reviewTotal.textContent = number.format(Math.round(totals.kcal)) + ' kcal' +
    (totals.missing.kcal ? ' · total partiel' : '');
  saveButton.disabled = !draft.entry.items.length;
}

function productLookup(item, refresh) {
  const details = el('details', 'lookup');
  const query = input('search', item.query || item.name, { maxlength: '120', placeholder: 'Marque, produit ou code-barres', enterkeyhint: 'search' });
  const search = button('Rechercher', 'button compact');
  search.prepend(icon('search'));
  const results = el('div', 'lookup-results');
  const status = el('p', 'small subtle');
  status.setAttribute('role', 'status');

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
      status.textContent = products.length ? 'Choisis le produit correspondant.' : 'Aucun produit trouvé. Essaie le code-barres ou saisis les valeurs de l’étiquette.';
      for (const product of products) {
        const option = button(product.name, 'button compact result-option');
        const reference = product.unit === 'ml' ? '100 ml' : product.unit === 'g' ? '100 g' : '100 g/ml';
        const value = product.kcal == null ? 'Énergie non renseignée' : number.format(product.kcal) + ' kcal / ' + reference;
        option.append(el('small', '', value));
        option.addEventListener('click', () => {
          const unitChanged = product.unit && product.unit !== item.unit;
          const { name, kcal, protein, carbs, fat, source } = product;
          Object.assign(item, { name, kcal, protein, carbs, fat, source, query: name });
          if (unitChanged) {
            item.unit = product.unit;
            item.estimated = true;
            refresh();
            status.textContent = 'L’unité a changé. Vérifie la quantité avec l’étiquette.';
            details.open = true;
          } else {
            refresh();
          }
          renderTotal();
        });
        results.append(option);
      }
    } catch {
      if (dialog.open) status.textContent = 'Recherche indisponible. Tu peux saisir les valeurs de l’étiquette.';
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

  function refreshMetadata() {
    detailTitle.textContent = 'Valeurs pour 100 ' + item.unit;
    const incomplete = Object.keys(nutrients).some(key => item[key] == null);
    metadata.textContent = [item.estimated ? 'Portion estimée' : '', item.source, incomplete ? 'Valeurs à compléter' : ''].filter(Boolean).join(' · ');
  }

  function refresh() {
    name.value = item.name;
    quantity.value = item.grams ?? '';
    unit.value = item.unit;
    for (const key of Object.keys(nutrients)) nutrientInputs[key].value = item[key] ?? '';
    refreshMetadata();
  }

  name.addEventListener('input', () => {
    item.name = name.value;
    item.query = name.value;
    name.setCustomValidity(name.value.trim() ? '' : 'Renseigne le nom de l’ingrédient.');
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
  editor.append(el('legend', '', 'Ingrédient ' + (index + 1)), fields, metadata, details, productLookup(item, () => {
    name.setCustomValidity('');
    refresh();
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
  draft.entry.items.push({ name: '', grams: 100, unit, estimated: true, source: '', kcal: null, protein: null, carbs: null, fat: null });
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

export function openReview(entry, date, save, remove = null) {
  draft = { entry: structuredClone(entry), save, remove };
  reviewError.hidden = true;
  $('#review-title').textContent = remove ? 'Modifier l’entrée' : 'Vérifier l’entrée';
  $('#review-date').textContent = formatDate(date);
  $('#delete-entry').hidden = !remove;
  reviewLabel.value = entry.label;
  renderEditors();
  renderTotal();
  dialog.showModal();
}
