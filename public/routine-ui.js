(() => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function selectDay(view, dayIndex) {
    if (!view || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return;

    view.querySelectorAll('[data-routine-day]').forEach((button) => {
      const selected = Number(button.dataset.routineDay) === dayIndex;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-selected', selected);
    });

    const rows = [...view.querySelectorAll('[data-routine-weekday]')];
    const visibleRows = rows.filter((row) => Number(row.dataset.routineWeekday) === dayIndex);
    rows.forEach((row) => { row.hidden = Number(row.dataset.routineWeekday) !== dayIndex; });

    const table = view.querySelector('[data-routine-table-wrap]');
    const empty = view.querySelector('[data-routine-empty]');
    const hasAnyPeriods = view.dataset.hasPeriods === 'true';
    if (table) table.hidden = visibleRows.length === 0;
    if (empty) {
      empty.hidden = visibleRows.length > 0;
      const heading = empty.querySelector('strong');
      const message = empty.querySelector('span');
      if (heading) heading.textContent = hasAnyPeriods ? `No periods scheduled for ${days[dayIndex]}` : 'No routine periods yet';
      if (message) message.textContent = hasAnyPeriods
        ? `The ${days[dayIndex]} timetable is clear. Choose another day to view its schedule.`
        : 'Add periods to make the weekly timetable available here.';
    }

    const label = view.querySelector('[data-routine-selected-label]');
    const currentDay = view.querySelector('[data-routine-day][aria-current="date"]');
    if (label) label.textContent = `${days[dayIndex]} timetable${currentDay && Number(currentDay.dataset.routineDay) === dayIndex ? ' · Today' : ''}`;
  }

  function initialize(root = document) {
    const views = [];
    if (root.matches?.('[data-routine-view]')) views.push(root);
    views.push(...root.querySelectorAll('[data-routine-view]'));
    views.forEach((view) => {
      if (view.dataset.routineUiReady === 'true') return;
      view.dataset.routineUiReady = 'true';
      const today = view.querySelector('[data-routine-day][aria-current="date"]');
      selectDay(view, today ? Number(today.dataset.routineDay) : 0);
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-routine-day]');
    if (!button) return;
    selectDay(button.closest('[data-routine-view]'), Number(button.dataset.routineDay));
  });

  initialize();
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) initialize(node);
      }
    }
  }).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
})();
