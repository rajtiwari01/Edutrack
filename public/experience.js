(() => {
  const enhancePasswords = (root = document) => {
    root.querySelectorAll('input[type="password"]:not([data-password-enhanced])').forEach((input) => {
      const field = input.closest('.field');
      if (!field) return;

      input.dataset.passwordEnhanced = 'true';
      input.classList.add('password-input');
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
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        toggle.setAttribute('aria-pressed', String(show));
        input.focus({ preventScroll: true });
      });
      field.classList.add('field-has-password-toggle');
      field.append(toggle);
    });
  };

  enhancePasswords();
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) enhancePasswords(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
