// ── Mini Calendar Picker Controller ──
let miniCalState = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  selectedISO: ''
};

function toggleMiniCalendarPicker() {
  const widget = document.getElementById('miniCalendarWidget');
  const label = document.getElementById('toggleMiniCalLabel');
  if (!widget) return;
  const isHidden = widget.classList.contains('hidden');
  widget.classList.toggle('hidden', !isHidden);
  label.innerText = isHidden ? 'Hide Calendar' : 'Show Calendar';
  if (isHidden) renderMiniCalendar();
}

function changeMiniCalMonth(delta) {
  miniCalState.viewMonth += delta;
  if (miniCalState.viewMonth > 11) {
    miniCalState.viewMonth = 0;
    miniCalState.viewYear += 1;
  } else if (miniCalState.viewMonth < 0) {
    miniCalState.viewMonth = 11;
    miniCalState.viewYear -= 1;
  }
  renderMiniCalendar();
}

function renderMiniCalendar() {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const title = document.getElementById('miniCalMonthYear');
  const grid = document.getElementById('miniCalGrid');
  if (!title || !grid) return;

  title.innerText = `${monthNames[miniCalState.viewMonth]} ${miniCalState.viewYear}`;

  const firstDayIndex = new Date(miniCalState.viewYear, miniCalState.viewMonth, 1).getDay();
  const totalDays = new Date(miniCalState.viewYear, miniCalState.viewMonth + 1, 0).getDate();

  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  let html = '';
  // Blank days before first of month
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<span class="py-1"></span>`;
  }

  // Days of current month
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${miniCalState.viewYear}-${String(miniCalState.viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = iso === todayISO;
    const isSelected = iso === miniCalState.selectedISO;

    let cellClass = 'py-1 rounded-lg cursor-pointer transition text-center ';
    if (isSelected) {
      cellClass += 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/40';
    } else if (isToday) {
      cellClass += 'border border-indigo-400/50 text-indigo-300 font-bold bg-indigo-500/10 hover:bg-indigo-500/20';
    } else {
      cellClass += 'text-slate-300 hover:bg-white/10 hover:text-white';
    }

    html += `<button type="button" onclick="selectMiniCalDate('${iso}')" class="${cellClass}">${d}</button>`;
  }

  grid.innerHTML = html;
}

function selectMiniCalDate(iso) {
  miniCalState.selectedISO = iso;
  document.getElementById('taskDueDateOnly').value = iso;
  syncCombinedDueTime();
  renderMiniCalendar();
}

function setQuickDate(type) {
  const d = new Date();
  if (type === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (type === 'weekend') {
    // Upcoming Saturday
    const day = d.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
  }
  const pad = n => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  miniCalState.viewYear = d.getFullYear();
  miniCalState.viewMonth = d.getMonth();
  selectMiniCalDate(iso);
}

function clearTaskDate() {
  miniCalState.selectedISO = '';
  document.getElementById('taskDueDateOnly').value = '';
  document.getElementById('taskDueTimeOnly').value = '';
  document.getElementById('taskDueTime').value = '';
  renderMiniCalendar();
}

function syncCombinedDueTime() {
  const dateVal = document.getElementById('taskDueDateOnly').value;
  const timeVal = document.getElementById('taskDueTimeOnly').value || '09:00';
  const combinedInput = document.getElementById('taskDueTime');

  if (dateVal) {
    miniCalState.selectedISO = dateVal;
    const [y, m] = dateVal.split('-');
    miniCalState.viewYear = parseInt(y);
    miniCalState.viewMonth = parseInt(m) - 1;
    combinedInput.value = `${dateVal}T${timeVal}`;
  } else {
    combinedInput.value = '';
  }
}

function toggleEmailReminderOptions() {
  const enabled = document.getElementById('taskEnableEmailReminder').checked;
  const opts = document.getElementById('emailReminderOptions');
  if (opts) opts.classList.toggle('hidden', !enabled);
}

function handleReminderPresetChange(preset) {
  const customContainer = document.getElementById('customReminderTimeContainer');
  if (customContainer) customContainer.classList.toggle('hidden', preset !== 'custom');
}

function computeReminderTime(dueTimeISO) {
  const enabled = document.getElementById('taskEnableEmailReminder').checked;
  if (!enabled) return null;

  const preset = document.getElementById('taskReminderPreset').value;
  if (preset === 'custom') {
    return document.getElementById('taskCustomReminderTime').value || null;
  }

  // Base date from dueTime or today
  let baseDate = dueTimeISO ? new Date(dueTimeISO) : new Date();
  if (isNaN(baseDate.getTime())) baseDate = new Date();

  if (preset === '1day_before') {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 1);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`;
  } else if (preset === 'morning_of') {
    const d = new Date(baseDate);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T08:00`;
  } else if (preset === '1hour_before') {
    const d = new Date(baseDate.getTime() - 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return null;
}

