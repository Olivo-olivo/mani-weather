(() => {
  'use strict';
  const button = document.getElementById('installApp');
  const status = document.getElementById('installStatus');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = standalone.matches;
  });
  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    button.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      status.textContent = choice.outcome === 'accepted' ? 'Installation requested · follow your phone’s prompts.' : '';
    } catch (_) {
      status.textContent = 'Open Chrome’s menu and choose Install app or Add to Home screen.';
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
    status.textContent = 'Mani Weather installed';
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    let controlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled && !reloading) { reloading = true; window.location.reload(); }
      controlled = true;
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    }).catch(() => {});
  }
})();
