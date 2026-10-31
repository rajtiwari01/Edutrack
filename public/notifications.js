(() => {
  const button = document.querySelector('#notification-button');
  const panel = document.querySelector('#notification-panel');
  const list = document.querySelector('#notification-list');
  const count = document.querySelector('#notification-count');
  const markRead = document.querySelector('#notification-mark-read');
  const enable = document.querySelector('#notification-enable');
  const permissionNote = document.querySelector('#notification-permission-note');
  const identity = document.querySelector('#identity');
  if (!button || !panel || !list || !count || !identity) return;

  let pollTimer = 0;
  let active = false;
  let initialized = false;
  let storageKey = '';
  let seenIds = new Set();
  let notifiedIds = new Set();
  let notifications = [];

  function readIds(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveIds(key, values) {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify([...values].slice(-100)));
    } catch {
      // In-app notifications remain available for this page session.
    }
  }

  function closePanel() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function permissionState() {
    if (!enable || !permissionNote) return;
    if (!('Notification' in window)) {
      enable.hidden = true;
      permissionNote.textContent = 'Browser notifications are not supported here. In-app updates still work while Edutrack is open.';
    } else if (Notification.permission === 'granted') {
      enable.hidden = true;
      permissionNote.textContent = 'Browser alerts are enabled while Edutrack is open.';
    } else if (Notification.permission === 'denied') {
      enable.hidden = true;
      permissionNote.textContent = 'Browser alerts are blocked in browser settings. In-app updates remain available.';
    } else {
      enable.hidden = false;
      permissionNote.textContent = 'Browser alerts require permission and Edutrack to remain open.';
    }
  }

  function messageFor(item) {
    if (item.kind === 'classroom') {
      const teacher = item.teacherName ? ` · ${item.teacherName}` : '';
      const room = item.roomNumber ? ` · Room ${item.roomNumber}` : '';
      return `${item.subjectName} has started${teacher}. Start time ${item.startsAt || 'now'}${room}.`;
    }
    return `Your college, ${item.collegeName}, has started the new academic session: ${item.sessionName}. Check your academic dashboard for the latest information.`;
  }

  function openClassroom(item) {
    seenIds.add(item.id);
    saveIds(storageKey, seenIds);
    render();
    closePanel();
    document.dispatchEvent(new CustomEvent('edutrack:open-classroom', { detail: { classroomId: item.classroomId || '' } }));
  }

  function render() {
    list.replaceChildren();
    const unread = notifications.filter(item => !seenIds.has(item.id));
    count.textContent = unread.length ? String(unread.length) : '';
    count.hidden = unread.length === 0;
    button.setAttribute('aria-label', unread.length ? `Notifications, ${unread.length} unread` : 'Notifications');
    if (markRead) markRead.hidden = unread.length === 0;

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
      heading.textContent = item.title || 'Edutrack update';
      const message = document.createElement('p');
      message.textContent = messageFor(item);
      const date = document.createElement('time');
      date.dateTime = item.createdAt || '';
      const parsedDate = new Date(item.createdAt);
      date.textContent = Number.isNaN(parsedDate.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
      card.append(heading, message, date);
      if (item.kind === 'classroom') {
        const open = document.createElement('button');
        open.className = 'button small primary notification-open';
        open.type = 'button';
        open.textContent = 'Open classroom';
        open.addEventListener('click', () => openClassroom(item));
        card.append(open);
      } else if (item.startsOn && item.endsOn) {
        const range = document.createElement('small');
        range.className = 'notification-range';
        range.textContent = `Session dates · ${item.startsOn} – ${item.endsOn}`;
        card.append(range);
      }
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
        seenIds = readIds(`${storageKey}:read`);
        notifiedIds = readIds(`${storageKey}:browser`);
      }
      const next = Array.isArray(data.notifications) ? data.notifications.filter(item => item && typeof item.id === 'string') : [];
      if (initialized && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        for (const item of next) {
          if (item.kind !== 'classroom' || notifiedIds.has(item.id)) continue;
          const alert = new Notification(`Edutrack · ${item.subjectName}`, {
            body: messageFor(item),
            icon: '/icons/edutrack-icon-192.png',
            tag: item.id,
            renotify: false
          });
          alert.onclick = () => openClassroom(item);
          notifiedIds.add(item.id);
        }
        saveIds(`${storageKey}:browser`, notifiedIds);
      }
      notifications = next;
      initialized = true;
      render();
    } catch {
      // Notification polling never blocks regular app use.
    }
  }

  function syncSignInState() {
    const signedIn = !identity.hidden;
    button.hidden = !signedIn;
    if (!signedIn) {
      active = false;
      initialized = false;
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
    permissionState();
  }

  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) {
      seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]);
      saveIds(`${storageKey}:read`, seenIds);
      render();
    }
  });
  document.querySelector('#notification-close')?.addEventListener('click', closePanel);
  markRead?.addEventListener('click', () => {
    seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]);
    saveIds(`${storageKey}:read`, seenIds);
    render();
  });
  enable?.addEventListener('click', async () => {
    if (!('Notification' in window) || Notification.permission !== 'default') return permissionState();
    try {
      await Notification.requestPermission();
    } finally {
      permissionState();
      await refresh();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) refresh(); });
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
