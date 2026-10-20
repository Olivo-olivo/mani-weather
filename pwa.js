(() => {
  'use strict';
  const button = document.getElementById('installApp');
  const help = document.getElementById('installHelp');
  const status = document.getElementById('installStatus');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;

  const isInstalled = () => standalone.matches || navigator.standalone === true;
  const installInstructions = () => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      return 'On iPhone or iPad, tap Share (the square with an upward arrow), then Add to Home Screen and Add. If you cannot find that option, open this page in Safari.';
    }
    if (/Android/i.test(ua)) {
      if (/Firefox/i.test(ua)) {
        return 'In Firefox, open the browser menu (⋮) and choose Install or Add app to Home screen. If the option is unavailable, try Chrome.';
      }
      return 'Open your browser menu (⋮) and choose Install app or Add to Home screen.';
    }
    return 'Open your browser menu and choose Install app if available. On iPhone, use Share → Add to Home Screen in Safari.';
  };
  const showHelp = () => {
    help.textContent = installInstructions();
    help.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  };
  const hideHelp = () => {
    help.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  button.hidden = isInstalled();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = isInstalled();
  });
  button.addEventListener('click', async () => {
    status.textContent = '';
    if (installPrompt) {
      const promptEvent = installPrompt;
      installPrompt = null;
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          button.hidden = true;
          hideHelp();
          status.textContent = 'Installation requested. Look for Mani Weather on your home screen.';
        } else {
          showHelp();
        }
      } catch (_) {
        showHelp();
      }
    } else if (help.hidden) {
      showHelp();
    } else {
      hideHelp();
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
    hideHelp();
    status.textContent = 'Mani Weather installed. Open it from your home screen.';
  });
  standalone.addEventListener?.('change', () => {
    button.hidden = isInstalled();
    if (isInstalled()) hideHelp();
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
