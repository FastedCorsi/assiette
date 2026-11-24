export async function prepareOffline({ status, notice, activate, canReload, warn }) {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Ce navigateur ne peut pas préparer le journal hors connexion.';
    return;
  }

  let reloadRequested = false;
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
    function showUpdate() {
      notice.hidden = !(registration.waiting && navigator.serviceWorker.controller);
    }
    function watch(worker) {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && reloadRequested) {
          reloadRequested = false;
          activate.disabled = false;
          status.textContent = 'Mise à jour interrompue. Réessaie quand tu es connecté.';
        } else if (worker.state === 'redundant' && !registration.active) {
          status.textContent = 'Le mode hors connexion est indisponible pour le moment.';
        }
        showUpdate();
      });
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadRequested) location.reload();
    });
    activate.addEventListener('click', () => {
      if (!registration.waiting) return;
      if (!canReload()) {
        warn();
        return;
      }
      reloadRequested = true;
      activate.disabled = true;
      watch(registration.waiting);
      registration.waiting.postMessage('activate-update');
    });
    status.textContent = 'Préparation du journal hors connexion…';
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    showUpdate();
    if (!registration.installing && !registration.waiting && !registration.active) {
      status.textContent = 'Le mode hors connexion est indisponible pour le moment.';
      return;
    }
    await navigator.serviceWorker.ready;
    status.textContent = 'Journal et Ciqual disponibles hors connexion. La photo et la recherche de marques peuvent demander Internet.';
  } catch {
    status.textContent = 'Le mode hors connexion est indisponible pour le moment.';
  }
}
