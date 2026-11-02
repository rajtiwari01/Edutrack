(() => {
  const button = document.querySelector('#notification-button');
  const panel = document.querySelector('#notification-panel');
  const list = document.querySelector('#notification-list');
  const count = document.querySelector('#notification-count');
  const markRead = document.querySelector('#notification-mark-read');
  const enable = document.querySelector('#notification-enable');
  const disable = document.querySelector('#notification-disable');
  const permissionNote = document.querySelector('#notification-permission-note');
  const identity = document.querySelector('#identity');
  if (!button || !panel || !list || !count || !identity) return;

  let pollTimer = 0, active = false, storageKey = '', seenIds = new Set(), notifications = [];

  function readIds(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []); }
    catch { return new Set(); }
  }

  function saveIds(key, values) {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify([...values].slice(-100))); }
    catch { /* In-app updates still work for this page session. */ }
  }

  function closePanel() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }

  async function permissionState() {
    if (!enable || !permissionNote) return;
    if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      enable.hidden = true; disable.hidden = true;
      permissionNote.textContent = 'Background push is not supported in this browser. In-app updates remain available while Edutrack is open.';
      return;
    }
    if (Notification.permission === 'denied') {
      enable.hidden = true; disable.hidden = true;
      permissionNote.textContent = 'Push permission is blocked in browser settings. In-app updates remain available.';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      enable.hidden = Boolean(subscription); disable.hidden = !subscription;
      permissionNote.textContent = subscription ? 'Background push is enabled on this device.' : Notification.permission === 'granted' ? 'Permission is granted. Enable background push for this device.' : 'Enable background push to receive classroom and notice alerts while Edutrack is closed.';
    } catch {
      enable.hidden = false; disable.hidden = true;
      permissionNote.textContent = 'Background push is unavailable here. In-app updates remain available.';
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
    seenIds.add(item.id); saveIds(`${storageKey}:read`, seenIds); render(); closePanel();
    document.dispatchEvent(new CustomEvent('edutrack:open-classroom', { detail: { classroomId: item.classroomId || '' } }));
  }

  function render() {
    list.replaceChildren();
    const unread = notifications.filter(item => !seenIds.has(item.id));
    count.textContent = unread.length ? String(unread.length) : ''; count.hidden = unread.length === 0;
    button.setAttribute('aria-label', unread.length ? `Notifications, ${unread.length} unread` : 'Notifications');
    if (markRead) markRead.hidden = unread.length === 0;
    if (!notifications.length) { const empty = document.createElement('p'); empty.className = 'notification-empty'; empty.textContent = 'You’re all caught up.'; list.append(empty); return; }
    for (const item of notifications) {
      const card = document.createElement('article'); card.className = `notification-item${seenIds.has(item.id) ? '' : ' unread'}`;
      const heading = document.createElement('h3'); heading.textContent = item.title || 'Edutrack update';
      const message = document.createElement('p'); message.textContent = messageFor(item);
      const date = document.createElement('time'); date.dateTime = item.createdAt || '';
      const parsedDate = new Date(item.createdAt); date.textContent = Number.isNaN(parsedDate.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
      card.append(heading, message, date);
      if (item.kind === 'classroom') { const open = document.createElement('button'); open.className = 'button small primary notification-open'; open.type = 'button'; open.textContent = 'Open classroom'; open.addEventListener('click', () => openClassroom(item)); card.append(open); }
      list.append(card);
    }
  }

  async function refresh() {
    if (!active) return;
    try {
      const response = await fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json(), nextKey = `edutrack:notification-seen:${data.collegeId}:${data.userId}`;
      if (storageKey !== nextKey) { storageKey = nextKey; seenIds = readIds(`${storageKey}:read`); }
      notifications = Array.isArray(data.notifications) ? data.notifications.filter(item => item && typeof item.id === 'string') : [];
      render();
    } catch { /* Polling never blocks normal app use. */ }
  }

  function decodeKey(value) {
    const base64 = String(value).replaceAll('-', '+').replaceAll('_', '/'), padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  }

  async function enablePush() {
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission !== 'granted') return permissionState();
      const registration = await navigator.serviceWorker.ready;
      const keyResponse = await fetch('/api/push/key', { credentials: 'same-origin', cache: 'no-store' });
      const keyData = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || 'Push is not configured for this college yet.');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(keyData.publicKey) });
      const response = await fetch('/api/push/subscription', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': window.edutrack?.state?.csrf || '' },
        body: JSON.stringify(subscription)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Push subscription could not be saved.');
      permissionNote.textContent = 'Background push is enabled on this device.';
    } catch (error) { permissionNote.textContent = error.message || 'Background push could not be enabled.'; }
    await permissionState(); await refresh();
  }

  async function disablePush() {
    try {
      const registration = await navigator.serviceWorker.ready, subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscription', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': window.edutrack?.state?.csrf || '' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
    } catch { /* Users can also remove a device from browser settings. */ }
    await permissionState();
  }

  function syncSignInState() {
    const signedIn = !identity.hidden; button.hidden = !signedIn;
    if (!signedIn) { active = false; clearInterval(pollTimer); pollTimer = 0; notifications = []; closePanel(); render(); }
    else if (!active) { active = true; refresh(); pollTimer = window.setInterval(refresh, 60000); }
    permissionState();
  }

  button.addEventListener('click', () => {
    const opening = panel.hidden; panel.hidden = !opening; button.setAttribute('aria-expanded', String(opening));
    if (opening) { seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]); saveIds(`${storageKey}:read`, seenIds); render(); }
  });
  document.querySelector('#notification-close')?.addEventListener('click', closePanel);
  markRead?.addEventListener('click', () => { seenIds = new Set([...seenIds, ...notifications.map(item => item.id)]); saveIds(`${storageKey}:read`, seenIds); render(); });
  enable?.addEventListener('click', enablePush);
  disable?.addEventListener('click', disablePush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) refresh(); });
  document.addEventListener('click', event => { if (!panel.hidden && !event.target.closest('.notification-shell')) closePanel(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { closePanel(); button.focus(); } });
  new MutationObserver(syncSignInState).observe(identity, { attributes: true, attributeFilter: ['hidden'] });
  syncSignInState();
})();
