import {
  makeBackupKey, encryptBackup, decryptBackup, parseBackup, fingerprint,
  loadDeviceBackup, saveDeviceBackup, updateDeviceBackup, clearDeviceBackup,
} from './backup-crypto.mjs';
import { makeGitHubBackup } from './backup-github.mjs';
import { exportJournal, importJournal } from './journal.mjs?v=simple-3';

const formatTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const isEmpty = state => !state.profile && !Object.keys(state.days).length;

export function createBackupSync({ getJournal, restoreJournal, report }) {
  let config = null;
  let busy = false;
  let queued = false;
  let timer;
  let retryDelay = 3000;

  function show(phase, message) {
    report({ connected: Boolean(config), blocked: Boolean(config?.blocked), busy, phase, message });
  }

  function showSaved() {
    const when = config?.lastSaved;
    show('saved', when ? 'Sauvegardé sur GitHub le ' + formatTime.format(new Date(when)) + '.' : 'La copie GitHub correspond au journal.');
  }

  function showConflict() {
    show('pending', 'Le journal et la copie GitHub diffèrent. Choisis la version à conserver pour reprendre la sauvegarde.');
  }

  function showError(error) {
    show('error', error.message || 'Sauvegarde indisponible. Ton journal est conservé sur cet appareil.');
  }

  function schedule(delay = 450) {
    clearTimeout(timer);
    timer = setTimeout(() => { void sync(); }, delay);
  }

  async function remember(changes) {
    if (!await updateDeviceBackup(config.connectionId, changes)) {
      config = null;
      throw new Error('La sauvegarde a été déconnectée de cet appareil.');
    }
    config = { ...config, ...changes };
  }

  async function currentConnection() {
    const current = await loadDeviceBackup();
    if (!current || current.connectionId !== config?.connectionId) {
      config = current;
      return false;
    }
    config = current;
    return true;
  }

  async function run(operation, { automatic = false } = {}) {
    if (busy) {
      if (automatic) queued = true;
      return;
    }
    busy = true;
    show('working', 'Vérification de la sauvegarde…');
    let result;
    try {
      result = await operation();
      retryDelay = 3000;
    } catch (error) {
      if (error.code === 'conflict' && config) {
        try {
          await remember({ blocked: true });
          result = showConflict;
        } catch (storageError) {
          result = () => showError(storageError);
        }
      } else {
        result = () => showError(error);
        if (automatic && config && error.code === 'unavailable' && navigator.onLine) {
          schedule(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 60000);
        }
      }
    } finally {
      busy = false;
      result?.();
      if (queued) {
        queued = false;
        if (config && !config.blocked) schedule();
      }
    }
  }

  async function saveToGitHub(state, remoteSha) {
    const text = exportJournal(state);
    const lastDigest = await fingerprint(text);
    const encrypted = await encryptBackup(text, config);
    const { sha, savedAt } = await makeGitHubBackup(config.token).write(encrypted, remoteSha);
    await remember({ baseSha: sha, lastDigest, lastSaved: savedAt ?? new Date().toISOString(), blocked: false });
  }

  function sync() {
    if (!config) return;
    return run(async () => {
      if (!await currentConnection()) {
        if (!config) return () => show('local', 'Journal enregistré sur cet appareil.');
        if (config.blocked) return showConflict;
        queued = true;
        return () => show('pending', 'Vérification de la copie GitHub…');
      }
      if (config.blocked) return showConflict;
      const journal = getJournal();
      const digest = await fingerprint(exportJournal(journal));
      if (digest === config.lastDigest) return showSaved;
      if (isEmpty(journal) && config.baseSha) {
        await remember({ blocked: true });
        return showConflict;
      }
      if (!navigator.onLine) return () => show('pending', 'Sauvegarde en attente de connexion.');
      await saveToGitHub(journal, config.baseSha);
      return showSaved;
    }, { automatic: true });
  }

  function changed() {
    if (!config || config.blocked) return;
    if (busy) { queued = true; return; }
    show('pending', 'Sauvegarde GitHub en attente…');
    schedule();
  }

  function connect(token, password) {
    return run(async () => {
      if (await loadDeviceBackup()) throw new Error('Cet appareil a déjà une sauvegarde connectée.');
      const remote = await makeGitHubBackup(token).read();
      const { key, salt } = await makeBackupKey(password, remote ? parseBackup(remote.text).salt : undefined);
      let lastDigest = null;
      let blocked = false;
      if (remote) {
        const remoteJournal = importJournal(await decryptBackup(remote.text, key));
        lastDigest = await fingerprint(exportJournal(remoteJournal));
        blocked = await fingerprint(exportJournal(getJournal())) !== lastDigest;
      }
      config = await saveDeviceBackup({ key, salt, token, baseSha: remote?.sha ?? null,
        lastSaved: remote?.savedAt ?? null, lastDigest, blocked });
      if (blocked) return showConflict;
      if (remote) return showSaved;
      queued = true;
      return () => show('pending', 'Sauvegarde GitHub en attente…');
    });
  }

  function restore() {
    return run(async () => {
      if (!await currentConnection()) throw new Error('Reconnecte la sauvegarde avant de la restaurer.');
      const localBefore = exportJournal(getJournal());
      const remote = await makeGitHubBackup(config.token).read();
      if (!remote) throw new Error('Ce dépôt ne contient encore aucune sauvegarde.');
      const recovered = importJournal(await decryptBackup(remote.text, config.key));
      const lastDigest = await fingerprint(exportJournal(recovered));
      await remember({ blocked: true });
      if (exportJournal(getJournal()) !== localBefore) {
        throw new Error('Le journal a changé pendant la lecture. Relance la restauration.');
      }
      restoreJournal(recovered);
      await remember({ baseSha: remote.sha, lastDigest, lastSaved: remote.savedAt ?? null, blocked: false });
      return () => show('saved', 'Journal restauré depuis GitHub.');
    });
  }

  function keepLocal() {
    return run(async () => {
      if (!await currentConnection()) throw new Error('Reconnecte la sauvegarde avant de choisir une version.');
      const remote = await makeGitHubBackup(config.token).read();
      if (remote) {
        importJournal(await decryptBackup(remote.text, config.key));
      }
      await saveToGitHub(getJournal(), remote?.sha ?? null);
      return showSaved;
    });
  }

  function disconnect() {
    return run(async () => {
      clearTimeout(timer);
      await clearDeviceBackup(config?.connectionId);
      config = null;
      return () => show('local', 'Sauvegarde GitHub déconnectée de cet appareil.');
    });
  }

  function initialize() {
    return run(async () => {
      config = await loadDeviceBackup();
      if (!config) return () => show('local', 'Journal enregistré sur cet appareil.');
      if (config.blocked) return showConflict;
      queued = true;
      return () => show('pending', 'Vérification de la copie GitHub…');
    });
  }

  return { initialize, changed, sync, connect, restore, keepLocal, disconnect };
}
