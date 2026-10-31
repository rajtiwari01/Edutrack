(() => {
  const installButton = document.querySelector('#install-app');
  const installDialog = document.querySelector('#install-dialog');
  let deferredInstall = null;
  let installedThisSession = false;
  const dismissalKey = 'edutrack:pwa-install-dismissed-until';

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function dismissedRecently() {
    try {
      return Number(localStorage.getItem(dismissalKey) || 0) > Date.now();
    } catch {
      return false;
    }
  }

  function updateInstallButton() {
    if (!installButton) return;
    installButton.hidden = installedThisSession || isStandalone() || dismissedRecently();
  }

  function showInstallInstructions() {
    const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAppleBrowser = isAppleMobile && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    const instructions = isAppleMobile
      ? (isAppleBrowser
        ? 'In Safari, tap Share, then choose Add to Home Screen.'
        : 'Open Edutrack in Safari, tap Share, then choose Add to Home Screen.')
      : /Android/.test(navigator.userAgent)
        ? 'Open your browser menu and choose Install app or Add to Home screen.'
        : 'Use the install icon in your browser address bar, or choose Install Edutrack from the browser menu.';
    installDialog.innerHTML = `<div class="dialog-inner"><div class="dialog-head"><h2 id="install-dialog-title">Install Edutrack</h2><button type="button" class="icon-button" data-install-close aria-label="Close installation instructions">×</button></div><div class="dialog-content"><p class="subtle">Add Edutrack to your device for a clean, app-like shortcut.</p><p class="install-instructions">${instructions}</p></div><div class="dialog-actions"><button type="button" class="button primary" data-install-close>Got it</button></div></div>`;
    installDialog.showModal();
  }

  installButton?.addEventListener('click', async () => {
    if (!deferredInstall) {
      showInstallInstructions();
      return;
    }
    const promptEvent = deferredInstall;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    deferredInstall = null;
    if (choice?.outcome === 'dismissed') {
      try {
        localStorage.setItem(dismissalKey, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
      } catch {
        // A missing preference store must not block installation.
      }
    }
    updateInstallButton();
  });

  installDialog?.addEventListener('click', event => {
    if (event.target.matches('[data-install-close]')) installDialog.close();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installedThisSession = true;
    try { localStorage.removeItem(dismissalKey); } catch { /* Optional preference only. */ }
    updateInstallButton();
  });
  updateInstallButton();

  function addPasswordToggles(root) {
    for (const input of root.querySelectorAll('input[type="password"]:not([data-password-enhanced])')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'password-control';
      input.dataset.passwordEnhanced = 'true';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.append(input);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.textContent = 'Show';
      toggle.setAttribute('aria-label', 'Show password');
      toggle.setAttribute('aria-pressed', 'false');
      toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
        toggle.setAttribute('aria-pressed', String(show));
        input.focus();
      });
      wrapper.append(toggle);
    }
  }

  addPasswordToggles(document);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) addPasswordToggles(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installation remains available without offline shell support.
    });
  }
})();
