(() => {
  const button = document.querySelector('#notification-button');
  const panel = document.querySelector('#notification-panel');
  const list = document.querySelector('#notification-list');
  const count = document.querySelector('#notification-count');
  const markRead = document.querySelector('#notification-mark-read');
  const identity = document.querySelector('#identity');
  if (!button || !panel || !list || !count || !identity) return;

  let pollTimer = 0;
  let active = false;
  let storageKey = '';
  let seenIds = new Set();
  let notifications = [];

  function readIds(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveSeen() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...seenIds].slice(-100)));
    } catch {
      // Notifications still work for this page session if storage is unavailable.
    }
  }

  function closePanel() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function render() {
    list.replaceChildren();
    const unread = notifications.filter(item => !seenIds.has(item.id));
    count.textContent = unread.length ? String(unread.length) : '';
    count.hidden = unread.length === 0;
    button.setAttribute('aria-label', unread.length ? `Notifications, ${unread.length} unread` : 'Notifications');
    markRead.hidden = unread.length === 0;

    if (!notifications.length) {
      const empty = document.createElement('p');
      empty.className = 'notification-empty';
      empty.textContent = 'You’re all caught up.';
      list.append(empty);
      return;
    }

    for (const item of notifications) {
      const card = document.createElement('article');
      card.className = `notification-item${seenIds.has(item.id) ? '' : ' unread'}`;
      const heading = document.createElement('h3');
      heading.textContent = item.title;
      const message = document.createElement('p');
      message.textContent = `Your college, ${item.collegeName}, has started the new academic session: ${item.sessionName}. Please check your academic dashboard for the latest information.`;
      const date = document.createElement('time');
      date.dateTime = item.createdAt;
      const parsedDate = new Date(item.createdAt);
      date.textContent = Number.isNaN(parsedDate.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
      const range = document.createElement('small');
      range.className = 'notification-range';
      range.textContent = item.startsOn && item.endsOn ? `Session dates · ${item.startsOn} – ${item.endsOn}` : '';
      card.append(heading, message, date);
      if (range.textContent) card.append(range);
      list.append(card);
    }
  }

  async function refresh() {
    if (!active) return;
    try {
      const response = await fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      const nextKey = `edutrack:notification-seen:${data.collegeId}:${data.userId}`;
      if (storageKey !== nextKey) {
        storageKey = nextKey;
        seenIds = readIds(storageKey);
      }
      notifications = Array.isArray(data.notifications) ? data.notifications.filter(item => item && typeof item.id === 'string') : [];
      render();
    } catch {
      // A notification check is non-blocking; normal Edutrack use remains available.
    }
  }

  function syncSignInState() {
    const signedIn = !identity.hidden;
    button.hidden = !signedIn;
    if (!signedIn) {
      active = false;
      clearInterval(pollTimer);
      pollTimer = 0;
      notifications = [];
      closePanel();
      render();
    } else if (!active) {
      active = true;
      refresh();
      pollTimer = window.setInterval(refresh, 60000);
    }
  }

  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) {
      seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]);
      saveSeen();
      render();
    }
  });
  document.querySelector('#notification-close')?.addEventListener('click', closePanel);
  markRead.addEventListener('click', () => {
    seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]);
    saveSeen();
    render();
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !event.target.closest('.notification-shell')) closePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
      button.focus();
    }
  });
  new MutationObserver(syncSignInState).observe(identity, { attributes: true, attributeFilter: ['hidden'] });
  syncSignInState();
})();
