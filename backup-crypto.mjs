const BACKUP_VERSION = 1;
const KEY_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_ENVELOPE_LENGTH = 20 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 20 * 1024 * 1024;
const MIN_COMPRESSION_BYTES = 1024;
const DATABASE = 'assiette-backup-v1';
const STORE = 'device';
const RECORD = 'connection';
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Le chiffrement exige un navigateur récent et une page HTTPS.');
  return globalThis.crypto;
}

function randomBytes(length) {
  return webCrypto().getRandomValues(new Uint8Array(length));
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64Size(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return -1;
  const padding = value.endsWith('==') ? 2 : Number(value.endsWith('='));
  return value.length / 4 * 3 - padding;
}

function isBackupKey(key) {
  return typeof CryptoKey !== 'undefined' && key instanceof CryptoKey && key.type === 'secret' &&
    !key.extractable && key.algorithm.name === 'AES-GCM' && key.algorithm.length === 256 &&
    key.usages.includes('encrypt') && key.usages.includes('decrypt');
}

function backupParameters(salt, iv, encoding) {
  const header = 'Assiette backup v1\n' + salt + (encoding ? '\n' + encoding : '');
  return { name: 'AES-GCM', iv, additionalData: encode.encode(header) };
}

async function compressJournal(bytes) {
  if (bytes.byteLength < MIN_COMPRESSION_BYTES || !globalThis.CompressionStream || !globalThis.DecompressionStream) return null;
  try {
    const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const result = await new Response(compressed).arrayBuffer();
    return result.byteLength + 32 < bytes.byteLength ? result : null;
  } catch {
    return null;
  }
}

async function decompressJournal(buffer) {
  if (!globalThis.DecompressionStream) {
    throw new Error('Ce navigateur ne peut pas ouvrir les sauvegardes compressées. Mets-le à jour ou change de navigateur.');
  }
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  let journalBytes = 0;
  try {
    // Limite aussi le volume que le moteur peut décompresser d’un coup.
    const compressed = new ReadableStream({
      pull(controller) {
        const end = Math.min(offset + 4096, bytes.length);
        if (offset < end) controller.enqueue(bytes.subarray(offset, end));
        offset = end;
        if (offset === bytes.length) controller.close();
      },
    });
    const bounded = new TransformStream({
      transform(chunk, controller) {
        journalBytes += chunk.byteLength;
        if (journalBytes > MAX_JOURNAL_BYTES) throw new Error('Sauvegarde trop volumineuse.');
        controller.enqueue(chunk);
      },
    });
    const stream = compressed.pipeThrough(new DecompressionStream('gzip')).pipeThrough(bounded);
    return decode.decode(await new Response(stream).arrayBuffer());
  } catch {
    if (journalBytes > MAX_JOURNAL_BYTES) throw new Error('La sauvegarde est trop volumineuse après décompression.');
    throw new Error('La sauvegarde compressée est endommagée.');
  }
}

export async function makeBackupKey(passphrase, salt = toBase64(randomBytes(SALT_BYTES))) {
  if (typeof passphrase !== 'string' || !passphrase.length || passphrase.length > 1024) {
    throw new Error('La phrase secrète est vide ou trop longue.');
  }
  if (base64Size(salt) !== SALT_BYTES) throw new Error('Les paramètres de chiffrement sont invalides.');
  const { subtle } = webCrypto();
  const material = await subtle.importKey('raw', encode.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({
    name: 'PBKDF2', salt: fromBase64(salt), iterations: KEY_ITERATIONS, hash: 'SHA-256',
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { key, salt };
}

export function parseBackup(envelopeText) {
  if (typeof envelopeText !== 'string' || envelopeText.length > MAX_ENVELOPE_LENGTH) {
    throw new Error('La sauvegarde chiffrée est illisible ou trop volumineuse.');
  }
  let envelope;
  try {
    envelope = JSON.parse(envelopeText);
  } catch {
    throw new Error('La sauvegarde chiffrée est illisible.');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).length !== (envelope.encoding === 'gzip' ? 5 : 4) || envelope.version !== BACKUP_VERSION ||
      base64Size(envelope.salt) !== SALT_BYTES || base64Size(envelope.iv) !== IV_BYTES ||
      base64Size(envelope.ciphertext) < TAG_BYTES) {
    throw new Error('Le format de cette sauvegarde chiffrée est inconnu ou invalide.');
  }
  return envelope;
}

export async function encryptBackup(text, { key, salt }) {
  if (!isBackupKey(key) || base64Size(salt) !== SALT_BYTES || typeof text !== 'string') {
    throw new Error('Les paramètres de chiffrement sont invalides.');
  }
  if (text.length > MAX_JOURNAL_BYTES) throw new Error('La sauvegarde est trop volumineuse.');
  const bytes = encode.encode(text);
  if (bytes.byteLength > MAX_JOURNAL_BYTES) throw new Error('La sauvegarde est trop volumineuse.');
  const compressed = await compressJournal(bytes);
  const payload = compressed ?? bytes;
  const iv = randomBytes(IV_BYTES);
  const envelope = { version: BACKUP_VERSION, salt, iv: toBase64(iv), ciphertext: '' };
  if (compressed) envelope.encoding = 'gzip';
  const overhead = JSON.stringify(envelope).length;
  if (overhead + 4 * Math.ceil((payload.byteLength + TAG_BYTES) / 3) > MAX_ENVELOPE_LENGTH) {
    throw new Error('La sauvegarde est trop volumineuse.');
  }
  const ciphertext = await webCrypto().subtle.encrypt(backupParameters(salt, iv, envelope.encoding), key, payload);
  envelope.ciphertext = toBase64(ciphertext);
  return JSON.stringify(envelope);
}

export async function decryptBackup(envelopeText, key) {
  const { salt, iv, ciphertext, encoding } = parseBackup(envelopeText);
  if (!isBackupKey(key)) throw new Error('La clé de sauvegarde est invalide.');
  let bytes;
  try {
    bytes = await webCrypto().subtle.decrypt(backupParameters(salt, fromBase64(iv), encoding), key, fromBase64(ciphertext));
    if (!encoding) return decode.decode(bytes);
  } catch {
    throw new Error('La phrase secrète ne correspond pas à cette sauvegarde, ou le fichier est endommagé.');
  }
  return decompressJournal(bytes);
}

export async function fingerprint(text) {
  const digest = await webCrypto().subtle.digest('SHA-256', encode.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openDeviceDatabase() {
  if (!globalThis.indexedDB) throw new Error('Le stockage de la connexion est indisponible.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Ferme les autres onglets d’Assiette et réessaie.'));
    };
  });
}

async function deviceTransaction(mode, run) {
  const database = await openDeviceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('Le stockage de la connexion a échoué.'));
      run(transaction.objectStore(STORE), (value) => { result = value; });
    });
  } finally {
    database.close();
  }
}

function readDeviceRecord(store, visit) {
  const request = store.get(RECORD);
  request.onsuccess = () => visit(request.result);
}

function connectionMetadata(changes) {
  const metadata = {};
  if (Object.hasOwn(changes, 'baseSha')) {
    const sha = changes.baseSha;
    if (sha != null && (typeof sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha))) {
      throw new Error('L’identifiant de la sauvegarde GitHub est invalide.');
    }
    metadata.baseSha = sha ?? null;
  }
  if (Object.hasOwn(changes, 'lastDigest')) {
    const digest = changes.lastDigest;
    if (digest != null && (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest))) {
      throw new Error('L’empreinte de la sauvegarde est invalide.');
    }
    metadata.lastDigest = digest ?? null;
  }
  if (Object.hasOwn(changes, 'lastSaved')) {
    const date = changes.lastSaved;
    if (date != null && (typeof date !== 'string' || date.length > 35 || Number.isNaN(Date.parse(date)))) {
      throw new Error('La date de sauvegarde est invalide.');
    }
    metadata.lastSaved = date ?? null;
  }
  if (Object.hasOwn(changes, 'blocked')) {
    if (typeof changes.blocked !== 'boolean') throw new Error('L’état de la sauvegarde est invalide.');
    metadata.blocked = changes.blocked;
  }
  return metadata;
}

function tokenParameters(connectionId, iv) {
  return { name: 'AES-GCM', iv, additionalData: encode.encode('Assiette GitHub token v1\n' + connectionId) };
}

export async function saveDeviceBackup(config) {
  const { token, key, salt } = config;
  if (typeof token !== 'string' || !token.length || token.length > 512 ||
      !isBackupKey(key) || base64Size(salt) !== SALT_BYTES) {
    throw new Error('La connexion de sauvegarde est invalide.');
  }
  const metadata = { baseSha: null, lastDigest: null, lastSaved: null, blocked: false, ...connectionMetadata(config) };
  const connectionId = toBase64(randomBytes(16));
  const { subtle } = webCrypto();
  const deviceKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle.encrypt(tokenParameters(connectionId, iv), deviceKey, encode.encode(token));
  const record = { connectionId, key, salt, deviceKey, iv, ciphertext, ...metadata };
  try {
    await deviceTransaction('readwrite', (store) => store.add(record, RECORD));
  } catch (error) {
    if (error.name === 'ConstraintError') throw new Error('Une connexion de sauvegarde existe déjà sur cet appareil.');
    throw error;
  }
  return { connectionId, token, key, salt, ...metadata };
}

export async function loadDeviceBackup() {
  const record = await deviceTransaction('readonly', readDeviceRecord);
  if (!record) return null;
  const { connectionId, key, salt, deviceKey, iv, ciphertext } = record;
  if (!isBackupKey(key) || !isBackupKey(deviceKey) || base64Size(salt) !== SALT_BYTES) {
    throw new Error('La connexion enregistrée est illisible. Déconnecte-la puis reconnecte cet appareil.');
  }
  let token;
  try {
    const bytes = await webCrypto().subtle.decrypt(tokenParameters(connectionId, iv), deviceKey, ciphertext);
    token = decode.decode(bytes);
  } catch {
    throw new Error('La connexion enregistrée est illisible. Déconnecte-la puis reconnecte cet appareil.');
  }
  return { connectionId, token, key, salt, ...connectionMetadata(record) };
}

export async function updateDeviceBackup(connectionId, changes) {
  const metadata = connectionMetadata(changes);
  return deviceTransaction('readwrite', (store, done) => {
    readDeviceRecord(store, (record) => {
      const matches = !!record && record.connectionId === connectionId;
      if (matches) store.put({ ...record, ...metadata }, RECORD);
      done(matches);
    });
  });
}

export async function clearDeviceBackup(connectionId) {
  return deviceTransaction('readwrite', (store, done) => {
    readDeviceRecord(store, (record) => {
      const matches = !!record && (connectionId == null || record.connectionId === connectionId);
      if (matches) store.delete(RECORD);
      done(matches);
    });
  });
}
