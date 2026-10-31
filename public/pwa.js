(() => {
  const installButton = document.getElementById('install-app');
  const helpDialog = document.getElementById('install-help');
  const instructions = document.getElementById('install-instructions');
  const dismissedKey = 'edutrack-install-dismissed-until';
  let installPrompt = null;

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dismissed = () => {
    try { return Number(localStorage.getItem(dismissedKey) || 0) > Date.now(); } catch { return false; }
  };
  const setDismissed = () => {
    try { localStorage.setItem(dismissedKey, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch {}
  };

  if (installButton && !isStandalone() && !dismissed()) installButton.hidden = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton && !dismissed()) {
      installButton.hidden = false;
      installButton.textContent = 'Install';
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  function showInstructions() {
    if (!instructions || !helpDialog) return;
    if (isIOS()) {
      instructions.textContent = 'In Safari, tap the Share button, scroll the menu, then tap “Add to Home Screen”. Confirm the name and tap Add.';
    } else if (/Android/i.test(navigator.userAgent)) {
      instructions.textContent = 'In your browser menu, choose “Install app” or “Add to Home screen”, then confirm.';
    } else {
      instructions.textContent = 'In your browser menu, choose “Install Edutrack” or “Install this site as an app”. The wording varies by browser.';
    }
    if (!helpDialog.open) helpDialog.showModal();
  }

  installButton?.addEventListener('click', async () => {
    if (!installPrompt) {
      showInstructions();
      return;
    }
    installButton.disabled = true;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'dismissed') setDismissed();
      if (choice?.outcome === 'accepted') installButton.hidden = true;
    } catch {
      showInstructions();
    } finally {
      installPrompt = null;
      installButton.disabled = false;
      if (dismissed()) installButton.hidden = true;
    }
  });

  helpDialog?.querySelectorAll('[data-install-close]').forEach((button) => {
    button.addEventListener('click', () => helpDialog.close());
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
  }
})();
