const RUNTIME = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
// MobileNetV3-Large Food-101 de yueyang-yin, sous licence MIT.
const MODEL = 'https://raw.githubusercontent.com/yueyang-yin/food-101/a5e27a18aee91413ae88c3bea4c0f1f65df0aec4/artifacts/onnx/food101_model_INT8_matmul_gemm_only.onnx';
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const DEVIATION = [0.229, 0.224, 0.225];

// Ordre des classes Food-101 utilisé par le modèle MobileNetV3.
const DISHES = [
  'Tarte aux pommes', 'Travers de porc', 'Baklava', 'Carpaccio de bœuf', 'Tartare de bœuf',
  'Salade de betteraves', 'Beignets', 'Bibimbap', 'Pudding de pain', 'Burrito du petit-déjeuner',
  'Bruschetta', 'Salade César', 'Cannoli', 'Salade caprese', 'Gâteau aux carottes',
  'Ceviche', 'Cheesecake', 'Assiette de fromages', 'Curry de poulet', 'Quesadilla au poulet',
  'Ailes de poulet', 'Gâteau au chocolat', 'Mousse au chocolat', 'Churros', 'Soupe aux palourdes',
  'Club sandwich', 'Galettes de crabe', 'Crème brûlée', 'Croque-madame', 'Cupcakes',
  'Œufs mimosa', 'Donuts', 'Raviolis vapeur', 'Edamame', 'Œufs Bénédicte',
  'Escargots', 'Falafels', 'Filet mignon', 'Fish and chips', 'Foie gras',
  'Frites', 'Soupe à l’oignon', 'Pain perdu', 'Calamars frits', 'Riz sauté',
  'Yaourt glacé', 'Pain à l’ail', 'Gnocchis', 'Salade grecque', 'Sandwich grillé au fromage',
  'Saumon grillé', 'Guacamole', 'Gyozas', 'Hamburger', 'Soupe aigre-piquante',
  'Hot-dog', 'Œufs à la mexicaine', 'Houmous', 'Glace', 'Lasagnes',
  'Bisque de homard', 'Sandwich au homard', 'Macaronis au fromage', 'Macarons', 'Soupe miso',
  'Moules', 'Nachos', 'Omelette', 'Rondelles d’oignon frites', 'Huîtres',
  'Pad thaï', 'Paella', 'Pancakes', 'Panna cotta', 'Canard laqué',
  'Phở', 'Pizza', 'Côte de porc', 'Poutine', 'Côte de bœuf',
  'Sandwich au porc effiloché', 'Ramen', 'Raviolis', 'Gâteau Red Velvet', 'Risotto',
  'Samoussas', 'Sashimis', 'Noix de Saint-Jacques', 'Salade d’algues', 'Crevettes et semoule de maïs',
  'Spaghettis bolognaise', 'Spaghettis carbonara', 'Rouleaux de printemps', 'Steak', 'Gâteau aux fraises',
  'Sushis', 'Tacos', 'Takoyakis', 'Tiramisu', 'Tartare de thon', 'Gaufres',
];

let photoWorker;
let requestId = 0;
let runtime;

async function pixelsFromPhoto(file) {
  const image = new Image();
  const imageUrl = URL.createObjectURL(file);
  try {
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext('2d');
    // Le modèle redimensionne le côté court à 256 px avant un recadrage au centre.
    const crop = Math.min(image.naturalWidth, image.naturalHeight) * SIZE / 256;
    context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2,
      crop, crop, 0, 0, SIZE, SIZE);
    return context.getImageData(0, 0, SIZE, SIZE).data;
  } catch {
    throw new Error('Cette image ne peut pas être lue. Essayez une photo JPEG, PNG ou WebP.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function analyzePhoto(file, onStatus = () => {}) {
  if (!(file instanceof Blob) || !file.size) throw new Error('Choisissez une photo de votre assiette.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choisissez une photo de moins de 25 Mo.');
  if (!globalThis.Worker || !globalThis.WebAssembly) {
    throw new Error('Ce navigateur ne prend pas en charge l’analyse photo. Vous pouvez saisir le repas à la main.');
  }

  onStatus('Lecture de la photo…');
  const pixels = await pixelsFromPhoto(file);
  try {
    photoWorker ??= new Worker(new URL(import.meta.url), { type: 'module' });
  } catch {
    throw new Error('Ce navigateur ne peut pas lancer l’analyse photo. Vous pouvez saisir le repas à la main.');
  }
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
      reject(new Error('L’analyse photo est indisponible. Vous pouvez saisir le repas à la main.'));
    }, { signal: listeners.signal });
    worker.postMessage({ id, pixels }, [pixels.buffer]);
  });
}

async function loadRuntime() {
  const [ort, response] = await Promise.all([
    import(RUNTIME + 'ort.wasm.min.mjs'),
    fetch(MODEL, { credentials: 'omit', referrerPolicy: 'no-referrer' }),
  ]);
  if (!response.ok) throw new Error('Le modèle est indisponible.');
  // GitHub Pages fonctionne sans isolation entre origines.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = RUNTIME;
  const session = await ort.InferenceSession.create(await response.arrayBuffer(), {
    executionProviders: ['wasm'],
  });
  return { ort, session };
}

async function classify({ id, pixels }) {
  if (!runtime) {
    runtime = loadRuntime().catch((error) => {
      runtime = undefined;
      throw error;
    });
    self.postMessage({ id, status: 'Chargement de l’analyse photo (environ 25 Mo au premier essai)…' });
  }
  let loaded;
  try {
    loaded = await runtime;
  } catch {
    self.postMessage({ id, error: 'Le modèle photo est indisponible. Vérifiez votre connexion ou saisissez le repas à la main.' });
    return;
  }

  self.postMessage({ id, status: 'Analyse sur cet appareil…' });
  try {
    const { ort, session } = loaded;
    const pixelCount = SIZE * SIZE;
    const normalized = new Float32Array(pixelCount * 3);
    for (let channel = 0; channel < 3; channel++) {
      for (let pixel = 0; pixel < pixelCount; pixel++) {
        normalized[channel * pixelCount + pixel] =
          (pixels[pixel * 4 + channel] / 255 - MEAN[channel]) / DEVIATION[channel];
      }
    }
    const input = new ort.Tensor('float32', normalized, [1, 3, SIZE, SIZE]);
    const result = await session.run({ [session.inputNames[0]]: input });
    const logits = result[session.outputNames[0]].data;
    if (logits.length !== DISHES.length) throw new Error('Classes incompatibles.');
    const maximum = Math.max(...logits);
    const weights = Float32Array.from(logits, (logit) => Math.exp(logit - maximum));
    const sum = weights.reduce((total, weight) => total + weight, 0);
    const ranked = DISHES.map((name, index) => ({ name, score: weights[index] / sum }))
      .sort((first, second) => second.score - first.score);
    const suggestions = ranked[0].score >= 0.22 ? ranked.filter(({ score }) => score >= 0.04).slice(0, 3) : [];
    self.postMessage({ id, suggestions });
  } catch {
    self.postMessage({ id, error: 'Cette photo n’a pas pu être analysée. Vous pouvez saisir le repas à la main.' });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.addEventListener('message', ({ data }) => classify(data));
}
