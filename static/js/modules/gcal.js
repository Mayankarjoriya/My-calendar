// ── Google Calendar ──
async function checkGCalStatus() {
  try {
    const status = await API.get('/api/google/status');
    gcalConnected = status.connected;
    updateGCalUI(status);
    if (gcalConnected) {
      await loadGCalEvents();
    }
  } catch (err) {
    gcalConnected = false;
  }
}

function updateGCalUI(status) {
  const dot = document.getElementById('gcalDot');
  const mobileDot = document.getElementById('mobileGCalDot');
  if (status.connected) {
    if (dot) dot.classList.remove('hidden');
    if (mobileDot) mobileDot.classList.remove('hidden');
    document.getElementById('gcalBtn').classList.add('gcal-connected');
    document.getElementById('gcalNotConnected').classList.add('hidden');
    document.getElementById('gcalConnected').classList.remove('hidden');
    if (status.email) document.getElementById('gcalConnectedEmail').textContent = status.email;
  } else {
    if (dot) dot.classList.add('hidden');
    if (mobileDot) mobileDot.classList.add('hidden');
    document.getElementById('gcalBtn').classList.remove('gcal-connected');
    document.getElementById('gcalNotConnected').classList.remove('hidden');
    document.getElementById('gcalConnected').classList.add('hidden');
  }
}

async function loadGCalEvents() {
  if (!gcalConnected) return;
  try {
    const data = await API.get('/api/google/events');
    const events = data.events || [];

    // Group events by local YYYY-MM-DD
    gcalEventsCache = {};
    events.forEach(ev => {
      if (!ev.start) return;
      let datePart = '';
      if (ev.is_all_day && ev.start.length === 10) {
        datePart = ev.start;
      } else {
        const d = new Date(ev.start);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        datePart = `${y}-${m}-${day}`;
      }
      if (!gcalEventsCache[datePart]) gcalEventsCache[datePart] = [];
      gcalEventsCache[datePart].push(ev);
    });

    renderGCalEvents(events, 'gcalEventsPreview');
    renderGCalEvents(events, 'gcalEventsList');

    // Refresh current view to show event badges/cards
    if (currentView === 'month') renderMonthTabContent();
    else if (currentView === 'dashboard') renderDashboard();

    if (currentDayISO) renderDayGCalEvents();
  } catch (err) {
    console.error('Failed to load Google Calendar events:', err);
  }
}

function renderGCalEvents(events, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No upcoming events found.</div>`;
    return;
  }

  container.innerHTML = events.map(ev => {
    const startDate = ev.start ? new Date(ev.start) : null;
    const dateStr   = startDate ? startDate.toLocaleDateString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'All day';
    return `
      <div class="gcal-event-pill p-3 rounded-xl flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-200 truncate">${escapeHTML(ev.summary)}</p>
          <p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-clock mr-1 text-blue-400"></i>${dateStr}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${ev.link ? `<a href="${ev.link}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
          <button onclick="deleteGCalEvent('${ev.id}')" class="text-slate-500 hover:text-rose-400 text-xs"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`;
  }).join('');
}

async function deleteGCalEvent(eventId) {
  try {
    await API.delete(`/api/google/events/${eventId}`);
    showToast('Event deleted from Google Calendar.', 'info');
    await loadGCalEvents();
  } catch (err) {
    showToast('Failed to delete event.', 'error');
  }
}

async function disconnectGCal() {
  try {
    await API.delete('/api/google/disconnect');
    gcalConnected = false;
    updateGCalUI({ connected: false });
    showToast('Google Calendar disconnected.', 'info');
  } catch (err) {
    showToast('Failed to disconnect.', 'error');
  }
}

function openGCalModal() {
  document.getElementById('gcalModal').classList.remove('hidden');
  document.getElementById('gcalSetupGuide').classList.add('hidden');
  if (gcalConnected) loadGCalEvents();
}

function closeGCalModal() {
  document.getElementById('gcalModal').classList.add('hidden');
}

function showSetupGuide() {
  document.getElementById('gcalModal').classList.remove('hidden');
  document.getElementById('gcalNotConnected').classList.add('hidden');
  document.getElementById('gcalSetupGuide').classList.remove('hidden');
}

