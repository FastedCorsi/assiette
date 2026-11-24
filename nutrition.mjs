import { photoFoods, photoDrinks } from './photo-foods.mjs';
import { findCiqualFood, findCiqualFoodByCode } from './ciqual-search.mjs?v=simple-3';

// Anses, Table Ciqual 2025, DOI 10.57745/RDMHWY, Licence ouverte Etalab 2.0.
// Each row records the Ciqual ID, display name, serving size, kcal, protein, carbs,
// fat and search aliases. Values are per 100 g. Trace values are rounded to zero;
// values below a published threshold are approximated by half that threshold.
const foods = [
  [9104, 'Riz blanc cuit', 150, 155, 3.31, 33.2, 0.7, 'riz|riz blanc|riz cuit'],
  [9100, 'Riz blanc cru', 60, 350, 7.38, 77.5, 0.79, 'riz cru|riz sec|riz blanc sec'],
  [9103, 'Riz complet cuit', 150, 187, 4.06, 37.6, 1.8, 'riz complet'],
  [9125, 'Riz basmati cuit', 150, 148, 3.19, 32.9, 0.4, 'riz basmati|basmati'],
  [9811, 'Pâtes cuites', 150, 167, 6.69, 31.4, 1.1, 'pâte|pâtes|pâtes cuites|pâtes cuits|spaghettis|spaghetti|penne|macaronis|fusilli'],
  [9810, 'Pâtes sèches', 65, 364, 13.1, 72.7, 1.6, 'pâtes crues|pâtes sèches crues|spaghettis crus'],
  [9871, 'Pâtes complètes cuites', 150, 179, 7.88, 31.3, 1.4, 'pâtes complètes'],
  [9341, 'Quinoa cuit', 150, 149, 5, 27.9, 1.1, 'quinoa'],
  [9683, 'Semoule cuite', 150, 164, 6.38, 31, 0.9, 'semoule|graine de couscous|semoule de couscous'],
  [9691, 'Boulgour cuit', 150, 131, 4.63, 24.1, 1, 'boulgour|bulgur'],
  [4014, 'Pomme de terre vapeur', 150, 76, 1.84, 15.8, 0.25, 'pomme de terre|pommes de terre|patate|patates|pomme de terre cuite|pommes de terre cuites'],
  [4008, 'Pomme de terre crue', 150, 80, 2.02, 16.2, 0.09, 'pommes de terre crues'],
  [4026, 'Pomme de terre au four', 150, 91.4, 2.5, 19, 0.13, 'pommes de terre au four|pommes de terre rôties'],
  [4102, 'Patate douce cuite', 150, 79.1, 1.69, 16.3, 0.15, 'patate douce|patates douces'],
  [7007, 'Baguette tradition', 60, 279, 8.94, 56.7, 1, 'baguette|pain|pain blanc', 250],
  [7110, 'Pain complet', 60, 234, 9.5, 41.2, 1.7, 'pain intégral'],
  [7200, 'Pain de mie', 50, 279, 7.74, 50.4, 4.37, 'pain de mie blanc|toast', 25],
  [7111, 'Pain de mie complet', 50, 257, 8, 41.8, 4.1, '', 25],
  [32140, 'Flocons d’avoine', 40, 369, 11.4, 57.7, 7.82, 'flocon d’avoine|avoine'],
  [9313, 'Flocons d’avoine cuits à l’eau', 150, 69.1, 2.72, 10.3, 1.52, 'porridge nature|porridge à l’eau'],
  [32004, 'Muesli', 45, 433, 8.87, 63.4, 14.3, 'müesli'],
  [32108, 'Granola aux fruits', 45, 442, 8.69, 62.7, 15.7, 'granola|muesli croustillant'],
  [36018, 'Filet de poulet cuit', 130, 141, 30.1, 0, 2, 'poulet|poulet cuit|filet de poulet|blanc de poulet|escalope de poulet|poulet grillé'],
  [36017, 'Filet de poulet cru', 130, 110, 23.4, 0, 1.5, 'poulet cru|blanc de poulet cru|escalope de poulet crue'],
  [36306, 'Escalope de dinde cuite', 130, 124, 28.5, 0, 1.09, 'dinde|blanc de dinde|escalope de dinde|dinde cuite'],
  [6200, 'Steak de bœuf grillé', 125, 128, 27.6, 0, 1.95, 'bœuf|boeuf cuit|steak|bifteck|steak de boeuf'],
  [6259, 'Steak haché cuit', 125, 229, 23.8, 0, 14.9, 'steak haché|bœuf haché|viande hachée'],
  [6251, 'Steak haché 5 % cuit', 125, 155, 25.5, 0, 5.85, 'steak 5%|steak haché 5%|bœuf haché 5%'],
  [6253, 'Steak haché 10 % cuit', 125, 210, 26.1, 0, 11.8, 'steak 10%|steak haché 10%|bœuf haché 10%'],
  [6255, 'Steak haché 15 % cuit', 125, 239, 23.6, 0, 16.1, 'steak 15%|steak haché 15%|bœuf haché 15%'],
  [28900, 'Jambon blanc', 50, 113, 21, 0.76, 2.83, 'jambon|jambon cuit', 40],
  [28963, 'Blanc de poulet en tranches', 50, 105, 20.7, 1.39, 1.79, 'jambon de poulet|tranche de blanc de poulet', 40],
  [28964, 'Blanc de dinde en tranches', 50, 99.3, 20.9, 0.023, 1.67, 'jambon de dinde|tranche de blanc de dinde', 40],
  [25996, 'Saumon cuit', 125, 205, 23.2, 0.61, 12.2, 'saumon|filet de saumon|pavé de saumon|saumon grillé'],
  [26036, 'Saumon cru', 125, 193, 20.5, 0, 12.4, 'filet de saumon cru'],
  [26037, 'Saumon fumé', 60, 184, 22.2, 0.13, 10.5, '', 30],
  [25997, 'Cabillaud cuit', 130, 100, 23.3, 0, 0.76, 'cabillaud|filet de cabillaud'],
  [26039, 'Thon au naturel égoutté', 100, 143, 26.8, 0, 3.94, 'thon|thon en boîte|thon nature|thon au naturel|boîte de thon'],
  [26180, 'Thon à l’huile égoutté', 100, 206, 23.3, 0.76, 12.2, 'thon à l’huile'],
  [26034, 'Sardines à l’huile égouttées', 100, 217, 23.3, 0.31, 13.7, 'sardine|sardines|sardines à l’huile'],
  [10007, 'Crevettes cuites', 100, 91.3, 20.5, 0.2, 0.79, 'crevette|crevettes|crevette cuite', 12],
  [22010, 'Œuf dur', 100, 134, 13.5, 0.52, 8.62, 'oeuf|oeufs|œufs durs|oeuf cuit|œufs cuits', 50],
  [22000, 'Œuf cru', 100, 140, 12.8, 0.06, 9.83, 'œufs crus', 50],
  [22500, 'Omelette nature', 110, 196, 13.8, 0.9, 15.3, 'omelette'],
  [20904, 'Tofu nature', 120, 147, 14.7, 2.87, 8.5, 'tofu'],
  [20912, 'Tofu fumé', 120, 164, 16.4, 2.91, 9.5, ''],
  [20360, 'Lentilles cuites', 150, 125, 10.1, 16.2, 0.57, 'lentille|lentilles|lentille cuite|lentilles vertes'],
  [20589, 'Lentilles corail cuites', 150, 123, 10.6, 15, 0.5, 'lentille corail|lentilles corail'],
  [20507, 'Pois chiches cuits', 150, 148, 8.31, 17.7, 3, 'pois chiches|pois chiche|pois chiche cuit'],
  [20503, 'Haricots rouges cuits', 150, 116, 9.63, 12.3, 0.6, 'haricot rouge|haricots rouges'],
  [20502, 'Haricots blancs cuits', 150, 112, 6.75, 12, 1.1, 'haricot blanc|haricots blancs'],
  [20030, 'Haricots verts cuits', 120, 29.4, 2, 3, 0.17, 'haricot vert|haricots verts'],
  [20037, 'Petits pois cuits', 120, 61.4, 5.8, 4.7, 0.87, 'petit pois|petits pois'],
  [20066, 'Maïs doux égoutté', 80, 105, 2.66, 18.3, 1.68, 'maïs|maïs doux|maïs en boîte'],
  [20003, 'Betterave cuite', 100, 41.5, 1.44, 7.13, 0.4, 'betterave|betteraves|betterave rouge'],
  [20351, 'Brocoli cuit', 120, 30, 3.17, 1.79, 0.6, 'brocoli|brocolis|brocolis cuits'],
  [20057, 'Brocoli cru', 120, 31.9, 2.9, 2.15, 0.36, 'brocolis crus'],
  [20009, 'Carotte crue', 90, 30.2, 0.78, 5.16, 0.25, 'carotte|carottes|carottes crues'],
  [20353, 'Carotte cuite', 90, 33, 0.37, 6.24, 0.2, 'carottes cuites'],
  [20385, 'Tomate crue', 120, 19.2, 0.6, 3.69, 0.25, 'tomate|tomates|tomates crues'],
  [20172, 'Tomates cerises', 100, 31.8, 1.31, 5.62, 0.25, 'tomate cerise|tomates cerise|tomate cherry', 15],
  [20021, 'Courgette cuite', 120, 15.5, 0.93, 1.4, 0.36, 'courgette|courgettes|courgettes cuites', 180],
  [20020, 'Courgette crue', 120, 16.7, 1.21, 1.75, 0.32, 'courgettes crues', 180],
  [20041, 'Poivron cru', 100, 22.6, 0.8, 3.5, 0.27, 'poivron|poivrons|poivron rouge|poivron jaune|poivron vert', 150],
  [20027, 'Épinards cuits', 120, 19.6, 3.2, 0.25, 0.14, 'épinard|épinards|épinard cuit'],
  [20019, 'Concombre', 100, 16.8, 0.65, 2.87, 0.11, 'concombres|concombre cru', 300],
  [20034, 'Oignon cru', 50, 39, 1.1, 6.25, 0.62, 'oignon|oignons', 100],
  [20031, 'Laitue', 60, 14.7, 1.35, 1.22, 0.2, 'salade|salade verte|feuilles de salade'],
  [20056, 'Champignons de Paris crus', 100, 21, 2.11, 1.83, 0.36, 'champignon|champignons|champignons de Paris'],
  [13004, 'Avocat', 75, 203, 1.56, 0, 20.6, 'avocats', 150],
  [13005, 'Banane', 120, 87.6, 1.06, 19.7, 0.25, 'bananes'],
  [13039, 'Pomme', 150, 54, 0.25, 11.6, 0.25, 'pommes'],
  [13034, 'Orange', 150, 42, 0.75, 8.03, 0.25, 'oranges'],
  [13024, 'Clémentine ou mandarine (chair)', 75, 45.5, 0.81, 9.17, 0.25, 'clémentine|clémentines|mandarine|mandarines', 75],
  [13040, 'Pomélo ou pamplemousse (chair)', 150, 33.5, 0.84, 5.92, 0.25, 'pomelo|pomélos|pamplemousse|pamplemousses'],
  [13014, 'Fraises', 100, 35.1, 0.63, 6.03, 0.25, 'fraise', 14],
  [13015, 'Framboises', 80, 47.9, 1.19, 5.83, 0.8, 'framboise', 4],
  [13028, 'Myrtilles', 80, 57.7, 0.87, 10.6, 0.33, 'myrtille'],
  [13021, 'Kiwi', 80, 60.9, 0.88, 11, 0.6, 'kiwis'],
  [13037, 'Poire', 150, 56.6, 0.36, 12.3, 0.27, 'poires'],
  [13025, 'Mangue', 150, 71.1, 0.63, 14.3, 0.25, 'mangues', 200],
  [19593, 'Yaourt nature', 125, 50.1, 3.75, 4.26, 1.68, 'yaourt|yaourts|yogourt|yaourts nature'],
  [19594, 'Yaourt nature 0 %', 125, 39.1, 4.08, 4.89, 0.05, 'yaourt 0%'],
  [19860, 'Yaourt à la grecque', 125, 103, 2.96, 3.73, 8.16, 'yaourt grec|yogourt grec'],
  [19646, 'Fromage blanc nature', 125, 75.7, 7.13, 3.86, 3.23, 'fromage blanc'],
  [19644, 'Fromage blanc 0 %', 125, 48.4, 7.19, 4.22, 0.05, 'fromage blanc nature 0%'],
  ['off:3033492056634', 'Skyr nature', 140, 51, 9, 3.4, 0.1, 'skyr'],
  [19590, 'Mozzarella de vache', 60, 227, 16.1, 0.7, 17.7, 'mozzarella|mozza', 125],
  [12115, 'Emmental', 30, 373, 27.3, 0, 28.8, 'emmenthal'],
  [12120, 'Parmesan', 20, 411, 30.5, 1.14, 31, 'parmesan râpé'],
  [12110, 'Comté', 30, 413, 27.2, 0, 33.8, ''],
  [12066, 'Feta', 40, 284, 14.8, 0.45, 24.3, ''],
  [12726, 'Cheddar', 30, 399, 24.2, 1.2, 32.6, ''],
  [16400, 'Beurre doux', 10, 753, 0.63, 0.71, 83, 'beurre'],
  [17270, 'Huile d’olive', 10, 899, 0.25, 0, 99.9, 'huile|huile d’olive vierge extra'],
  [15000, 'Amandes', 25, 615, 22.6, 9.51, 51.3, 'amande', 1.2],
  [15005, 'Noix', 25, 709, 15.7, 6.88, 67.3, 'cerneaux de noix', 5],
  [15054, 'Noix de cajou grillées', 25, 618, 20.5, 21.3, 48.1, 'noix de cajou|cajou', 1.6],
  [15053, 'Cacahuètes grillées', 25, 644, 26.9, 14.4, 51.9, 'cacahuète|cacahuètes|arachides', 1.1],
  [15202, 'Beurre de cacahuètes', 15, 643, 25.4, 17.3, 51.4, 'beurre de cacahuète|pâte d’arachide|peanut butter'],
  [25621, 'Houmous', 50, 258, 8.06, 9, 19.9, 'hummus'],
  [11054, 'Mayonnaise', 15, 692, 1.33, 3.41, 74.5, 'mayo'],
  [11013, 'Moutarde', 10, 151, 6.92, 4.33, 11.2, ''],
  [11107, 'Sauce tomate aux oignons', 50, 78.8, 1.52, 7.69, 4.18, 'sauce tomate'],
  [31008, 'Miel', 10, 331, 0.65, 82.1, 0, ''],
  [31016, 'Sucre blanc', 5, 399, 0, 99.7, 0, 'sucre', 5],
  [31074, 'Chocolat noir 70 %', 20, 591, 10.4, 26.9, 46.3, 'chocolat noir|chocolat noir 70%|chocolat', 5],
  [31032, 'Pâte à tartiner chocolat-noisette', 15, 549, 5.02, 57.9, 32.4, 'pâte à tartiner'],
  [30999, 'Confiture', 20, 235, 0.36, 57.1, 0.27, 'confitures'],
  [7619, 'Croissant au beurre', 60, 420, 7.25, 45.7, 22.6, 'croissant|croissants|croissant pur beurre'],
  [23827, 'Pancake sucré', 75, 358, 5.5, 45.3, 16.6, 'pancake|pancakes', 40],
  [23799, 'Crêpe nature', 60, 257, 6.31, 41.6, 6.8, 'crêpe|crêpes|crêpes nature', 60],
  [23850, 'Gaufre nature', 75, 301, 8, 36.1, 13.4, 'gaufre|gaufres'],
  [23490, 'Tarte aux pommes', 100, 227, 2.52, 32.7, 8.79, 'tartelette aux pommes'],
  [23880, 'Beignet sucré nature', 65, 404, 7.25, 39.4, 23.7, 'beignet|beignets|donut|donuts'],
  [24684, 'Cookie au chocolat', 35, 493, 6.44, 61, 23.8, 'cookie|cookies|cookies au chocolat'],
  [25903, 'Soupe de légumes', 250, 36.8, 0.84, 4.5, 1.45, 'soupe|soupe aux légumes|potage'],
  [25972, 'Soupe miso', 200, 16.5, 1.24, 2.37, 0.34, 'miso'],
  [25628, 'Salade César au poulet', 250, 151, 8.13, 4.88, 10, 'salade césar|caesar salad'],
  [25018, 'Ratatouille', 150, 57.1, 1.22, 4.97, 3.15, ''],
  [25111, 'Chili con carne', 300, 118, 7.13, 13, 3.35, 'chili'],
  [25174, 'Poulet au curry et lait de coco', 225, 125, 10.6, 4.07, 6.9, 'curry de poulet|poulet au curry'],
  [25085, 'Pâtes à la bolognaise', 275, 116, 5.32, 13.6, 4.07, 'pâtes bolognaise|spaghettis à la bolognaise|spaghetti bolognaise|spaghettis bolognaise'],
  [25135, 'Pâtes à la carbonara', 275, 161, 5.91, 14.2, 8.7, 'pâtes carbonara|spaghettis à la carbonara|spaghetti carbonara|spaghettis carbonara'],
  [25187, 'Risotto aux légumes', 250, 120, 2.88, 18.4, 3.8, 'risotto'],
  [25242, 'Paëlla maison (poulet et fruits de mer)', 275, 135, 6.38, 22, 2.2, 'paella|paella maison|paella au poulet et fruits de mer'],
  [25138, 'Couscous au poulet', 275, 130, 7.5, 15.6, 3.85, 'couscous poulet'],
  [25137, 'Tartiflette (référence préemballée)', 275, 161, 6, 13.5, 8.9, 'tartiflette'],
  [25001, 'Blanquette de veau (référence préemballée)', 250, 113, 15.4, 3.1, 4, 'blanquette|blanquette de veau'],
  [25009, 'Hachis parmentier à la viande (référence préemballée)', 275, 138, 5.99, 9.39, 8.22, 'hachis parmentier|hachis parmentier à la viande'],
  [25405, 'Quiche lorraine', 160, 269, 8.39, 21.5, 16.4, 'quiche'],
  [25456, 'Sushis aux produits de la mer', 200, 171, 6.69, 26.9, 3.7, 'sushi|sushis|maki|makis|sushi saumon', 28],
  [25459, 'Burrito au bœuf', 250, 170, 8, 14.3, 8.5, 'burrito|burritos'],
  [25404, 'Pizza margherita', 250, 224, 8.7, 29.6, 7.41, 'pizza|pizza margarita|pizza fromage', 380],
  [25081, 'Lasagnes à la viande', 275, 134, 6.29, 13.5, 5.72, 'lasagne|lasagnes|lasagnes bolognaise'],
  [25413, 'Hamburger', 180, 251, 13.3, 29.5, 8.44, 'burger|burgers|hamburgers'],
  [25428, 'Kebab en pita', 250, 232, 15.2, 17, 10.9, 'kebab|sandwich kebab|sandwich grec'],
  [4032, 'Frites', 120, 258, 3.28, 32.7, 11.9, 'portion de frites'],
  [4030, 'Frites au four', 120, 213, 3.75, 32.6, 6.6, ''],
  ...photoFoods,
];

const drinks = [
  [18066, 'Eau', 250, 0, 0, 0, 0, 'eau plate|eau gazeuse|eau pétillante|eau minérale|eau du robinet'],
  [18004, 'Café nature', 150, 5.78, 0.25, 1.35, 0.018, 'café|café noir|café filtre|café sans sucre'],
  [18071, 'Espresso', 35, 6.54, 0.25, 1.16, 0.2, 'expresso'],
  [18020, 'Thé nature', 200, 0.4, 0.1, 0, 0, 'thé|thé noir|thé vert|thé sans sucre'],
  [18022, 'Infusion nature', 200, 0.8, 0, 0.2, 0, 'tisane|infusion'],
  [19033, 'Lait demi-écrémé', 200, 47.5, 3.38, 4.97, 1.55, 'lait|lait demi écrémé'],
  [19023, 'Lait entier', 200, 64.6, 3.39, 4.77, 3.55, ''],
  [19118, 'Lait chocolaté', 200, 72.8, 3.42, 11, 1.58, 'chocolat chaud|lait au chocolat'],
  [18107, 'Boisson à l’amande sans sucre ajouté', 200, 35.8, 1.06, 0.68, 3.2, 'lait d’amande|boisson amande'],
  [18899, 'Boisson à l’avoine sans sucre ajouté', 200, 41, 0.25, 7.78, 1.1, 'lait d’avoine|boisson avoine'],
  [18900, 'Boisson au soja', 200, 42.4, 3.5, 1.87, 2.1, 'lait de soja|boisson soja'],
  [2070, 'Jus d’orange pur jus', 200, 45.4, 0.61, 9.61, 0.11, 'jus orange|jus d’orange|jus d’oranges'],
  [2074, 'Jus de pomme pur jus', 200, 48.9, 0.17, 11.4, 0.14, 'jus de pomme|jus de pommes'],
  [18018, 'Cola sucré', 330, 40.1, 0, 10, 0, 'cola'],
  [18060, 'Cola sans sucre ajouté', 330, 1.04, 0, 0.25, 0, 'cola zéro|cola sans sucre'],
  [5001, 'Bière 4–5 %', 330, 39, 0.39, 3.12, 0, 'bière|bières|bière blonde'],
  [5030, 'Bière sans alcool', 330, 29.4, 0.2, 6.08, 0.053, ''],
  [5214, 'Vin rouge', 120, 75.7, 0.16, 0, 0.25, ''],
  ...photoDrinks,
];

function normalize(value) {
  return value.toLocaleLowerCase('fr-FR').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ').replace(/\s*%/g, '%')
    .replace(/[^a-z0-9%]+/g, ' ').trim();
}

const catalog = new Map();
for (const [entries, unit] of [[foods, 'g'], [drinks, 'ml']]) {
  for (const [id, name, serving, kcal, protein, carbs, fat, aliases, piece = serving] of entries) {
    const source = typeof id === 'number' ? 'Ciqual 2025' : 'Exemple générique · Open Food Facts';
    const fiber = findCiqualFoodByCode(id)?.fiber ?? null;
    const entry = { name, serving, piece, unit, kcal, protein, carbs, fat, fiber, source };
    for (const alias of [name, ...aliases.split('|')].filter(Boolean)) catalog.set(normalize(alias), entry);
  }
}

export function findFoodReference(name, unit) {
  const entry = catalog.get(normalize(name)) ?? findCiqualFood(name);
  return entry && (unit == null || entry.unit === unit) ? entry : null;
}

const measures = 'kilogrammes?|kilos?|kg|grammes?|grs?|g|millilitres?|ml|centilitres?|cl|décilitres?|dl|litres?|l';
const numberPattern = '\\d+(?:[.,]\\d+)?';
const signedNumber = `[-−]?${numberPattern}`;
const explicitAmount = new RegExp(`(?<![\\p{L}\\d.,-])(?:(${signedNumber})\\s*[x×]\\s*)?(${signedNumber})\\s*(${measures})(?![\\p{L}\\d])`, 'iu');
const decimalComma = new RegExp(`^\\d+(?:\\s*(?:${measures})(?![\\p{L}])|\\s*[%x×]|\\s+[^\\d\\s]|$)`, 'iu');
const countedAmount = new RegExp(`^(${signedNumber}|un|une|deux|trois|quatre|cinq)\\s+(?:[x×]\\s*)?(?!%)`, 'iu');
const multipliedAmount = new RegExp(`^(${signedNumber})\\s*[x×]\\s*`, 'iu');
const halfAmount = /^(?:(?:un[e]?\s+)?demi[e]?|1\s*\/\s*2|½)[\s-]+/iu;

const writtenCounts = new Map(Object.entries({ un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 }));
const portions = new Map(Object.entries({
  verre: 250, bouteille: 500, canette: 330, tasse: 200, mug: 250,
  bol: 250, tranche: 30, carre: 5, poignee: 25, 'cuillere a soupe': 15, 'cuillere a cafe': 5,
}));
const liquidContainers = new Set(['verre', 'bouteille', 'canette', 'tasse', 'mug']);
const spoonContainers = new Set(['cuillere a soupe', 'cuillere a cafe']);
const portionPattern = /^(cuill[eè]res?\s+[àa]\s+(?:soupe|caf[eé])|c\.?\s*[àa]\s*[sc]|c[cs]|verres?|bouteilles?|canettes?|tasses?|mugs?|bols?|tranches?|carr[eé]s?|poign[eé]es?|pots?|portions?|pi[eè]ces?)\b\.?\s+/iu;

function trimFoodName(value) {
  return value.replace(/[()\[\]]/g, '').replace(/^[\s:-]+|[\s:-]+$/g, '')
    .replace(/^(?:de\s+la\s+|de\s+l['’]\s*|du\s+|des\s+|de\s+|d['’]\s*)/i, '')
    .replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
  return Number(value.replace(',', '.').replace('−', '-'));
}

function parseQuantity(text) {
  const measured = text.match(explicitAmount);
  if (measured) {
    const multiplier = measured[1] ? parseNumber(measured[1]) : 1;
    const value = parseNumber(measured[2]);
    const measure = normalize(measured[3]);
    const isVolume = measure.endsWith('l') || measure.includes('litre');
    const factor = measure.startsWith('k') || ['l', 'litre', 'litres'].includes(measure) ? 1000
      : measure.startsWith('d') ? 100 : measure.startsWith('c') ? 10 : 1;
    const remaining = trimFoodName(text.replace(measured[0], ' '));
    const name = trimFoodName(remaining.replace(countedAmount, '').replace(portionPattern, ''));
    return { name, amount: multiplier > 0 && value > 0 ? value * multiplier * factor : 0, unit: isVolume ? 'ml' : 'g' };
  }

  const half = text.match(halfAmount);
  const match = half ?? text.match(multipliedAmount) ?? text.match(countedAmount);
  let name = match ? text.slice(match[0].length).trim() : text;
  const portion = name.match(portionPattern);
  let container = portion ? normalize(portion[1]).replace(/s$/, '').replace(/^cuilleres /, 'cuillere ') : '';
  if (portion && /^(?:ca[sc]|c[cs])$/.test(normalize(portion[1]).replace(/\s/g, ''))) {
    container = normalize(portion[1]).endsWith('s') ? 'cuillere a soupe' : 'cuillere a cafe';
  }
  if (portion) name = name.slice(portion[0].length);
  const countText = match?.[1] ?? '';
  const count = half ? 0.5 : match ? writtenCounts.get(normalize(countText)) ?? parseNumber(countText) : null;
  return { name: trimFoodName(name) || text, count, container };
}

function splitMeal(text) {
  const parts = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const isDecimal = char === ',' && /\d/.test(text[index - 1] ?? '') && decimalComma.test(text.slice(index + 1));
    if (';,\n\r'.includes(char) && !isDecimal) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function parseItem(text, isDrink) {
  const { name, amount, unit, count, container } = parseQuantity(text);
  const entry = findFoodReference(name);
  const inferredUnit = unit ?? entry?.unit ?? (isDrink || liquidContainers.has(container) ? 'ml' : 'g');
  const serving = entry?.serving ?? (inferredUnit === 'ml' ? 250 : 100);
  let portion = portions.get(container) ?? (container === 'portion' || container === 'pot' ? serving : entry?.piece);
  if (container === 'tranche' && entry?.piece !== entry?.serving && entry.piece <= 60) portion = entry.piece;
  if (spoonContainers.has(container) && normalize(name).startsWith('huile')) portion *= 0.91;
  const assumedPortion = count !== null || container ? portion ?? serving : serving;
  const quantity = amount ?? (count ?? 1) * assumedPortion;
  const equivalentVolume = inferredUnit === 'ml' && entry?.unit === 'g';
  const isOil = entry?.name === 'Huile d’olive';
  const isSoup = entry?.name.startsWith('Soupe ');
  const nutrition = equivalentVolume && !isOil && !isSoup ? null : entry;
  const grams = Math.round(quantity * (equivalentVolume && isOil ? 0.91 : 1) * 100) / 100;
  return {
    name: entry?.name ?? (name.slice(0, 160) || (inferredUnit === 'ml' ? 'Boisson à identifier' : 'Aliment à identifier')),
    query: name.slice(0, 120),
    grams: grams >= 0.01 && grams <= 100000 ? grams : null,
    unit: equivalentVolume && isOil ? 'g' : inferredUnit,
    estimated: amount === undefined || (equivalentVolume && isOil),
    kcal: nutrition?.kcal ?? null,
    protein: nutrition?.protein ?? null,
    carbs: nutrition?.carbs ?? null,
    fat: nutrition?.fat ?? null,
    fiber: nutrition?.fiber ?? null,
    source: nutrition ? `${nutrition.source}${inferredUnit === 'ml' && !isOil ? ' · ≈ 1 g/ml' : ''}` : 'À renseigner',
  };
}

export function parseMeal(text, isDrink = false) {
  return splitMeal(text).map(item => parseItem(item, isDrink));
}

const offOrigin = 'https://world.openfoodfacts.org';
const offFields = 'code,product_name,product_name_fr,brands,nutriments,quantity,product_quantity_unit';

function nutrient(value, maximum) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= maximum ? amount : null;
}

function productUnit(product) {
  const unit = product.product_quantity_unit;
  if (unit === 'g' || unit === 'ml') return unit;
  if (typeof product.quantity !== 'string') return undefined;
  if (/\d\s*(?:m[ℓl]|c[ℓl]|d[ℓl]|[ℓl])\b/i.test(product.quantity)) return 'ml';
  if (/\d\s*(?:kg|g)\b/i.test(product.quantity)) return 'g';
  return undefined;
}

function formatProduct(product) {
  const name = [product.product_name_fr, product.product_name].find(value => typeof value === 'string' && value.trim())?.trim();
  if (!name) return null;
  const brands = typeof product.brands === 'string' ? product.brands.split(',').map(value => value.trim()).filter(Boolean) : [];
  const brand = brands.find(value => !normalize(name).includes(normalize(value)));
  const code = String(product.code ?? '');
  const barcode = /^\d{8,14}$/.test(code) ? code : null;
  const nutrients = product.nutriments ?? {};
  const kcal = nutrient(nutrients['energy-kcal_100g'], 1000);
  const kilojoules = nutrient(nutrients['energy-kj_100g'], 4184);
  return {
    name: (brand ? `${name} · ${brand}` : name).slice(0, 160).trim(),
    kcal: kcal ?? (kilojoules === null ? null : Math.round(kilojoules / 4.184 * 10) / 10),
    protein: nutrient(nutrients.proteins_100g, 100),
    carbs: nutrient(nutrients.carbohydrates_100g, 100),
    fat: nutrient(nutrients.fat_100g, 100),
    fiber: nutrient(nutrients.fiber_100g, 100),
    source: 'Open Food Facts',
    barcode,
    url: barcode ? `https://world.openfoodfacts.org/product/${barcode}` : '',
    unit: productUnit(product),
  };
}

export async function lookupProducts(query, signal) {
  const term = query.trim().slice(0, 120);
  if (term.length < 2) return [];
  const code = term.replace(/\s/g, '');
  const isBarcode = /^\d{8,14}$/.test(code);
  const url = new URL(isBarcode ? `/api/v3/product/${code}` : '/cgi/search.pl', offOrigin);
  if (isBarcode) {
    url.searchParams.set('fields', offFields);
  } else {
    url.searchParams.set('action', 'process');
    url.searchParams.set('search_terms', term.toLocaleLowerCase('fr-FR'));
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('json', '1');
  }

  // The barcode API accepts an application identifier. The legacy text search
  // does not reliably handle the cross-origin preflight for that header.
  const headers = isBarcode ? { 'X-User-Agent': 'Assiette-Journal/1.0 (GitHub Pages)' } : undefined;
  const response = await fetch(url, { signal, headers });
  if (isBarcode && response.status === 404) return [];
  if (response.status === 429) throw new Error('Open Food Facts limite les recherches. Réessaie dans un instant.');
  if (!response.ok) throw new Error('Open Food Facts est momentanément indisponible.');
  const result = await response.json();
  const products = isBarcode ? [result.product] : result.products ?? [];
  return products.filter(Boolean).map(formatProduct).filter(product => product &&
    [product.kcal, product.protein, product.carbs, product.fat, product.fiber].some(value => value !== null)).slice(0, 8);
}
