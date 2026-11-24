const RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const MODEL_URL = new URL('./foodseg-mobilenet.onnx', import.meta.url);
const INPUT_SIZE = 512;
const MASK_SIZE = 128;
const MEAN = [0.485, 0.456, 0.406];
const DEVIATION = [0.229, 0.224, 0.225];

// FoodSeg103 indices. Background and the unspecified "other" class are excluded.
const FOODS = [
  '', 'Bonbons', 'Tartelette aux œufs', 'Frites', 'Chocolat', 'Biscuit', 'Pop-corn', 'Pudding',
  'Glace', 'Fromage', 'Gâteau', 'Vin rouge', 'Milkshake', 'Café', 'Jus de fruits', 'Lait', 'Thé',
  'Amandes', 'Haricots rouges', 'Noix de cajou', 'Canneberges séchées', 'Soja', 'Noix', 'Cacahuètes',
  'Œuf', 'Pomme', 'Datte', 'Abricot', 'Avocat', 'Banane', 'Fraise', 'Cerise', 'Myrtille',
  'Framboise', 'Mangue', 'Olives', 'Pêche', 'Citron', 'Poire', 'Figue', 'Ananas', 'Raisin',
  'Kiwi', 'Melon', 'Orange', 'Pastèque', 'Steak', 'Porc', 'Poulet', 'Saucisse', 'Viande frite',
  'Agneau', 'Sauce', 'Crabe', 'Poisson cuit', 'Coquillages', 'Crevettes', 'Soupe', 'Pain', 'Maïs',
  'Hamburger', 'Pizza', 'Bao', 'Raviolis wonton', 'Pâtes cuites', 'Nouilles cuites', 'Riz cuit',
  'Tarte', 'Tofu', 'Aubergine', 'Pomme de terre', 'Ail', 'Chou-fleur', 'Tomate', 'Kombu', 'Algues',
  'Oignon nouveau', 'Feuilles de colza', 'Gingembre', 'Gombo', 'Laitue', 'Potiron', 'Concombre',
  'Radis blanc', 'Carotte', 'Asperges', 'Pousses de bambou', 'Brocoli', 'Céleri branche', 'Herbes fraîches',
  'Pois mange-tout', 'Chou', 'Pousses de haricot mungo', 'Oignon', 'Poivron', 'Haricots verts',
  'Haricots verts', 'Pleurote du panicaut', 'Shiitake', 'Enoki', 'Pleurote', 'Champignons de Paris', 'Salade verte', '',
];
const LIQUIDS = new Set(['Vin rouge', 'Milkshake', 'Café', 'Jus de fruits', 'Lait', 'Thé', 'Soupe']);
const LIGHT_PORTIONS = new Map([
  ['Laitue', 0.28], ['Salade verte', 0.28], ['Herbes fraîches', 0.08], ['Oignon nouveau', 0.12],
  ['Ail', 0.12], ['Gingembre', 0.12], ['Kombu', 0.22], ['Algues', 0.22], ['Sauce', 0.26],
  ['Pop-corn', 0.22], ['Pain', 0.54], ['Fromage', 0.4], ['Olives', 0.44], ['Noix', 0.37], ['Amandes', 0.37],
  ['Noix de cajou', 0.37], ['Cacahuètes', 0.37], ['Canneberges séchées', 0.37],
]);

let photoWorker;
let requestId = 0;
let runtime;
let inferenceQueue = Promise.resolve();

async function readPixels(file) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
    const scale = INPUT_SIZE / Math.max(image.naturalWidth, image.naturalHeight);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    if (!width || !height) throw new Error('Dimensions non prises en charge.');
    const x = Math.floor((INPUT_SIZE - width) / 2);
    const y = Math.floor((INPUT_SIZE - height) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = INPUT_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#808080';
    context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    context.drawImage(image, x, y, width, height);
    return { pixels: context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data, bounds: { x, y, width, height } };
  } catch {
    throw new Error('Cette image ne peut pas être lue. Essaie une photo JPEG, PNG ou WebP.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function analyzePhoto(file, onStatus = () => {}) {
  if (!(file instanceof Blob) || !file.size) throw new Error('Choisis une photo de ton assiette.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choisis une photo de moins de 25 Mo.');
  if (!globalThis.Worker || !globalThis.WebAssembly) throw new Error('Ce navigateur ne prend pas en charge l’analyse photo.');
  onStatus('Lecture de la photo…');
  const { pixels, bounds } = await readPixels(file);
  photoWorker ??= new Worker(new URL(import.meta.url), { type: 'module' });
  const worker = photoWorker;
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    worker.addEventListener('message', ({ data }) => {
      if (data.id !== id) return;
      if (data.status) {
        onStatus(data.status);
        return;
      }
      listeners.abort();
      if (data.error) reject(new Error(data.error));
      else resolve(data.suggestions);
    }, { signal: listeners.signal });
    worker.addEventListener('error', () => {
      listeners.abort();
      worker.terminate();
      if (photoWorker === worker) photoWorker = undefined;
      reject(new Error('L’analyse photo est indisponible.'));
    }, { signal: listeners.signal });
    worker.postMessage({ id, pixels, bounds }, [pixels.buffer]);
  });
}

async function loadRuntime() {
  const [ort, response] = await Promise.all([
    import(RUNTIME_URL + 'ort.wasm.min.mjs'),
    fetch(MODEL_URL, { referrerPolicy: 'no-referrer' }),
  ]);
  if (!response.ok) throw new Error('Modèle indisponible.');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = RUNTIME_URL;
  const session = await ort.InferenceSession.create(await response.arrayBuffer(), {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  });
  return { ort, session };
}

function findFoods(classes, confidence, bounds) {
  if (classes.length !== MASK_SIZE ** 2 || confidence.length !== classes.length) {
    throw new Error('Dimensions du masque incompatibles.');
  }
  const maskScale = MASK_SIZE / INPUT_SIZE;
  const left = Math.ceil(bounds.x * maskScale);
  const top = Math.ceil(bounds.y * maskScale);
  const right = Math.floor((bounds.x + bounds.width) * maskScale);
  const bottom = Math.floor((bounds.y + bounds.height) * maskScale);
  const photoArea = (right - left) * (bottom - top);
  const foods = new Map();
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const pixel = row * MASK_SIZE + column;
      const name = FOODS[classes[pixel]];
      const score = confidence[pixel];
      if (!name || score < 0.36) continue;
      const region = foods.get(name) ?? { name, pixels: 0, confidence: 0 };
      region.pixels += 1;
      region.confidence += score;
      foods.set(name, region);
    }
  }
  const regions = [...foods.values()].sort((a, b) => b.pixels - a.pixels);
  const counted = regions.reduce((total, region) => total + region.pixels, 0);
  if (counted < photoArea * 0.045) return [];
  const minimumRegion = Math.max(24, photoArea * 0.004, counted * 0.021);
  const visible = regions.filter(region => region.pixels >= minimumRegion).slice(0, 10);
  const visiblePixels = visible.reduce((total, region) => total + region.pixels, 0);
  // Projected area provides relative sizes. A usual serving anchors grams;
  // thin leaves and garnishes get a smaller weight than dense main foods.
  const serving = visible.length > 1 ? 340 : 260;
  return visible.map(({ name, pixels, confidence }) => {
    const multiplier = LIGHT_PORTIONS.get(name) ?? (LIQUIDS.has(name) ? 0.8 : 1);
    return { name, score: confidence / pixels, grams: Math.max(5, Math.round(serving * pixels / visiblePixels * multiplier / 5) * 5) };
  });
}

async function segment({ id, pixels, bounds }) {
  if (!runtime) {
    runtime = loadRuntime().catch(error => {
      runtime = undefined;
      throw error;
    });
    self.postMessage({ id, status: 'Chargement du modèle photo (environ 30 Mo au premier essai)…' });
  }
  let loaded;
  try {
    loaded = await runtime;
  } catch {
    self.postMessage({ id, error: 'Le modèle photo est indisponible. Vérifie ta connexion.' });
    return;
  }
  self.postMessage({ id, status: 'Reconnaissance des aliments visibles…' });
  try {
    const { ort, session } = loaded;
    const pixelCount = INPUT_SIZE ** 2;
    const normalized = new Float32Array(pixelCount * 3);
    for (let channel = 0; channel < 3; channel++) {
      for (let pixel = 0; pixel < pixelCount; pixel++) {
        normalized[channel * pixelCount + pixel] = (pixels[pixel * 4 + channel] / 255 - MEAN[channel]) / DEVIATION[channel];
      }
    }
    const input = new ort.Tensor('float32', normalized, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const { classes, confidence } = await session.run({ image: input });
    self.postMessage({ id, suggestions: findFoods(classes.data, confidence.data, bounds) });
  } catch {
    self.postMessage({ id, error: 'Cette photo n’a pas pu être analysée.' });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.addEventListener('message', ({ data }) => {
    inferenceQueue = inferenceQueue.then(() => segment(data));
  });
}
