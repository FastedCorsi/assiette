import { parseBackup } from './backup-crypto.mjs';

const REPOSITORY = 'FastedCorsi/assiette-sauvegarde';
const REPOSITORY_URL = `https://api.github.com/repos/${REPOSITORY}`;
const BACKUP_FILE = 'journal.chiffre.json';
const CONTENTS_URL = `${REPOSITORY_URL}/contents/${BACKUP_FILE}`;
const API_VERSION = '2026-03-10';
const JSON_MEDIA_TYPE = 'application/vnd.github+json';
const CONTENTS_MEDIA_TYPE = 'application/vnd.github.object+json';
const RAW_MEDIA_TYPE = 'application/vnd.github.raw+json';
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/;

const messages = {
  'invalid-token': 'Saisis un jeton GitHub à permissions granulaires valide.',
  auth: 'GitHub a refusé le jeton. Vérifie sa valeur et sa date d’expiration.',
  forbidden: 'Le jeton ne permet pas d’accéder à la sauvegarde. Vérifie le dépôt sélectionné et les droits Contents.',
  'not-private': 'Le dépôt de sauvegarde doit être privé. Vérifie ses réglages GitHub.',
  unavailable: 'GitHub est momentanément inaccessible. Réessaie dans un instant.',
  'invalid-data': 'Le fichier de sauvegarde chiffré ou la réponse GitHub est invalide.',
  'too-large': 'La sauvegarde chiffrée dépasse la limite de 20 Mio.',
  conflict: 'La sauvegarde distante a changé. Relis sa version avant de l’écraser.',
};

export class GitHubBackupError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = 'GitHubBackupError';
    this.code = code;
  }
}

function requireSize(size) {
  if (size > MAX_BACKUP_BYTES) throw new GitHubBackupError('too-large');
  if (!Number.isSafeInteger(size) || size <= 0) throw new GitHubBackupError('invalid-data');
}

function requireEncryptedEnvelope(text) {
  try {
    parseBackup(text);
  } catch {
    throw new GitHubBackupError('invalid-data');
  }
}

function encodedContent(bytes) {
  const chunks = [];
  // Each boundary is a multiple of three bytes, so only the final chunk is padded.
  const chunkSize = 3 * 4096;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(start, start + chunkSize))));
  }
  return chunks.join('');
}

function decodedContent(content, expectedSize) {
  if (typeof content !== 'string') throw new GitHubBackupError('invalid-data');
  const compact = content.replace(/\s/g, '');
  if (compact.length !== Math.ceil(expectedSize / 3) * 4) throw new GitHubBackupError('invalid-data');
  try {
    return Uint8Array.from(atob(compact), character => character.charCodeAt(0));
  } catch {
    throw new GitHubBackupError('invalid-data');
  }
}

function decodeBackup(bytes, expectedSize) {
  if (bytes.length !== expectedSize) throw new GitHubBackupError('invalid-data');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new GitHubBackupError('invalid-data');
  }
  requireEncryptedEnvelope(text);
  return text;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new GitHubBackupError('invalid-data');
  }
}

function requireSuccess(response) {
  if (response.ok) return;
  if (response.status === 401) throw new GitHubBackupError('auth');
  if (response.status === 404 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') !== '0' && !response.headers.has('retry-after'))) {
    throw new GitHubBackupError('forbidden');
  }
  if (response.status === 413) throw new GitHubBackupError('too-large');
  throw new GitHubBackupError('unavailable');
}

async function isMissingOrStaleSha(response) {
  const details = await response.json().catch(() => null);
  if (Array.isArray(details?.errors) && details.errors.some(error => error?.field === 'sha')) return true;
  return typeof details?.message === 'string' &&
    /\bsha\b.{0,80}(?:match|missing|not supplied|required)|already exists/i.test(details.message);
}

export function makeGitHubBackup(token, fetchImpl = globalThis.fetch) {
  if (typeof token !== 'string' || !/^github_pat_[A-Za-z0-9_]{1,200}$/.test(token.trim())) {
    throw new GitHubBackupError('invalid-token');
  }
  const authorization = `Bearer ${token.trim()}`;

  async function request(url, { accept = JSON_MEDIA_TYPE, body, timeout = 15000 } = {}) {
    const headers = { Accept: accept, Authorization: authorization, 'X-GitHub-Api-Version': API_VERSION };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetchImpl(url, {
        method: body === undefined ? 'GET' : 'PUT',
        headers,
        body,
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout?.(timeout),
      });
      if (response.redirected || (response.url && response.url !== url) || response.status >= 300 && response.status < 400) {
        throw new GitHubBackupError('unavailable');
      }
      return response;
    } catch {
      throw new GitHubBackupError('unavailable');
    }
  }

  async function verifiedBranch() {
    const response = await request(REPOSITORY_URL);
    requireSuccess(response);
    const repository = await parseJson(response);
    if (repository?.full_name?.toLowerCase() !== REPOSITORY.toLowerCase()) throw new GitHubBackupError('forbidden');
    if (repository.private !== true || repository.visibility !== 'private') throw new GitHubBackupError('not-private');
    if (typeof repository.default_branch !== 'string' || !repository.default_branch.trim() || repository.default_branch.length > 250) {
      throw new GitHubBackupError('invalid-data');
    }
    return repository.default_branch;
  }

  function contentsUrl(branch) {
    return `${CONTENTS_URL}?${new URLSearchParams({ ref: branch })}`;
  }

  async function verifyMissingFile(branch) {
    const response = await request(`${REPOSITORY_URL}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
    requireSuccess(response);
    const reference = await parseJson(response);
    if (reference?.ref !== `refs/heads/${branch}` || reference?.object?.type !== 'commit' || !SHA_PATTERN.test(reference.object.sha)) {
      throw new GitHubBackupError('invalid-data');
    }
  }

  async function read() {
    const branch = await verifiedBranch();
    const response = await request(contentsUrl(branch), { accept: CONTENTS_MEDIA_TYPE });
    if (response.status === 404) {
      await verifyMissingFile(branch);
      return null;
    }
    requireSuccess(response);
    const file = await parseJson(response);
    if (file?.type !== 'file' || file.path !== BACKUP_FILE || file.submodule_git_url || !SHA_PATTERN.test(file.sha)) {
      throw new GitHubBackupError('invalid-data');
    }
    requireSize(file.size);
    let bytes;
    if (file.encoding === 'base64') {
      bytes = decodedContent(file.content, file.size);
    } else if (file.encoding === 'none') {
      // A blob URL binds the raw read to the exact immutable SHA we just received.
      const blob = await request(`${REPOSITORY_URL}/git/blobs/${file.sha}`, { accept: RAW_MEDIA_TYPE, timeout: 60000 });
      requireSuccess(blob);
      const length = Number(blob.headers.get('content-length'));
      if (length > MAX_BACKUP_BYTES) throw new GitHubBackupError('too-large');
      try {
        bytes = new Uint8Array(await blob.arrayBuffer());
      } catch {
        throw new GitHubBackupError('unavailable');
      }
    } else {
      throw new GitHubBackupError('invalid-data');
    }
    return { sha: file.sha, text: decodeBackup(bytes, file.size) };
  }

  async function write(text, baseSha = null) {
    if (typeof text !== 'string' || (baseSha !== null && !SHA_PATTERN.test(baseSha))) {
      throw new GitHubBackupError('invalid-data');
    }
    requireSize(text.length);
    const bytes = new TextEncoder().encode(text);
    requireSize(bytes.length);
    requireEncryptedEnvelope(text);
    const branch = await verifiedBranch();
    const body = JSON.stringify({
      message: 'Enregistrer la sauvegarde chiffrée Assiette',
      content: encodedContent(bytes),
      branch,
      ...(baseSha === null ? {} : { sha: baseSha }),
    });
    const response = await request(CONTENTS_URL, { body, timeout: 60000 });
    if (response.status === 409 || (response.status === 422 && await isMissingOrStaleSha(response))) {
      throw new GitHubBackupError('conflict');
    }
    requireSuccess(response);
    const result = await parseJson(response);
    if (!SHA_PATTERN.test(result?.content?.sha)) throw new GitHubBackupError('invalid-data');
    const savedAt = result?.commit?.committer?.date;
    return {
      sha: result.content.sha,
      ...(typeof savedAt === 'string' && Number.isFinite(Date.parse(savedAt)) ? { savedAt } : {}),
    };
  }

  return { read, write };
}
