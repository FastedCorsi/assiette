import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { decryptBackup, encryptBackup, fingerprint, makeBackupKey, parseBackup } from './backup-crypto.mjs';

test('a new device with the phrase can open an authenticated backup', async () => {
  const sample = '{"note":"Petit-déjeuner et 🥝"}';
  const original = await makeBackupKey('Une phrase de test indépendante');
  assert.equal(original.key.extractable, false);
  const first = await encryptBackup(sample, original);
  const second = await encryptBackup(sample, original);
  const envelope = parseBackup(first);
  assert.notEqual(envelope.iv, parseBackup(second).iv);
  assert.equal(envelope.encoding, undefined);
  assert.equal(envelope.salt, original.salt);
  assert.equal(first.includes('déjeuner'), false);
  const newDevice = await makeBackupKey('Une phrase de test inde\u0301pendante', envelope.salt);
  assert.equal(await decryptBackup(first, newDevice.key), sample);
  await assert.rejects(crypto.subtle.exportKey('raw', original.key));

  const wrongDevice = await makeBackupKey('Une autre phrase de test', envelope.salt);
  await assert.rejects(decryptBackup(first, wrongDevice.key), /phrase secrète/);
  const corrupt = { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) };
  await assert.rejects(decryptBackup(JSON.stringify(corrupt), original.key), /endommagé/);
  const changedSalt = { ...envelope, salt: (envelope.salt[0] === 'A' ? 'B' : 'A') + envelope.salt.slice(1) };
  await assert.rejects(decryptBackup(JSON.stringify(changedSalt), original.key), /endommagé/);
});

test('gzip saves space and authenticates the encoding while reading legacy backups', async () => {
  const config = await makeBackupKey('Une phrase de test pour la compression');
  const frame = async (bytes, encoding) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const header = 'Assiette backup v1\n' + config.salt + (encoding ? '\n' + encoding : '');
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(header),
    }, config.key, bytes);
    return JSON.stringify({
      version: 1, salt: config.salt, iv: Buffer.from(iv).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'), ...(encoding ? { encoding } : {}),
    });
  };
  const text = JSON.stringify(Array(200).fill('Repas et boisson 🥝'));
  const backup = await encryptBackup(text, config);
  assert.ok(backup.length < text.length / 4);
  const { encoding, ...legacyShape } = parseBackup(backup);
  assert.equal(encoding, 'gzip');
  assert.equal(await decryptBackup(backup, config.key), text);
  await assert.rejects(decryptBackup(JSON.stringify(legacyShape), config.key), /endommagé/);
  assert.throws(() => parseBackup(JSON.stringify({ ...legacyShape, encoding: 'brotli' })), /format/);

  const oldBackup = await frame(Buffer.from(text));
  assert.equal(await decryptBackup(oldBackup, config.key), text);
  await assert.rejects(decryptBackup(await frame(Buffer.from(text), 'gzip'), config.key), /compressée est endommagée/);
  const large = gzipSync(Buffer.alloc(20 * 1024 * 1024 + 1, 65));
  await assert.rejects(decryptBackup(await frame(large, 'gzip'), config.key), /trop volumineuse après décompression/);
});

test('an envelope rejects plaintext, malformed binary fields and unknown versions', async () => {
  const key = await makeBackupKey('Une phrase réservée aux tests');
  const envelope = parseBackup(await encryptBackup('test', key));
  for (const invalid of [
    '',
    'null',
    '{"journal":"test"}',
    JSON.stringify({ ...envelope, journal: 'test' }),
    JSON.stringify({ ...envelope, version: 2 }),
    JSON.stringify({ ...envelope, iv: envelope.iv.slice(1) }),
    JSON.stringify({ ...envelope, salt: envelope.salt.replace(/^./, '?') }),
    JSON.stringify({ ...envelope, ciphertext: 'YQ==' }),
  ]) {
    assert.throws(() => parseBackup(invalid), /sauvegarde chiffrée/);
  }
  assert.equal(await fingerprint('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
