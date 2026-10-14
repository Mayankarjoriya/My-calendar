// ── Day Modal ──
function openDayModal(isoDate) {
  currentDayISO = isoDate;
  const [ys, ms, ds] = isoDate.split('-');
  const year = +ys, monthIdx = +ms - 1, dayNum = +ds;
  const mObj = TARGET_MONTHS.find(m => m.year === year && m.monthIdx === monthIdx);

  document.getElementById('dayModalNum').innerText = String(dayNum).padStart(2,'0');
  document.getElementById('dayModalDayName').innerText = getDayName(year, monthIdx, dayNum);
  document.getElementById('dayModalFullDate').innerText =
    `${getFullDayName(year,monthIdx,dayNum)}, ${mObj ? mObj.name.split(' ')[0] : ''} ${dayNum}, ${year}`;
  document.getElementById('dayModalWeekMeta').innerText = `Chronos Planner · ${mObj ? mObj.name : ''}`;

  const dayKey = `day_${isoDate}`;
  document.getElementById('dayNotesTextarea').value = plannerData.scratchpads[dayKey] || '';
  renderDayTaskList();
  renderDayGCalEvents();
  document.getElementById('dayModal').classList.remove('hidden');
}

function renderDayGCalEvents() {
  const sec = document.getElementById('dayGCalSection');
  const list = document.getElementById('dayGCalEventsList');
  const countEl = document.getElementById('dayGCalCount');
  if (!sec || !list || !currentDayISO) return;

  const events = gcalEventsCache[currentDayISO] || [];
  if (!gcalConnected || events.length === 0) {
    sec.classList.add('hidden');
    return;
  }

  sec.classList.remove('hidden');
  countEl.innerText = events.length;

  list.innerHTML = events.map(ev => {
    let timeStr = 'All day';
    if (!ev.is_all_day && ev.start && ev.start.includes('T')) {
      const d = new Date(ev.start);
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 font-medium text-blue-200">
            <i class="fa-solid fa-calendar-day text-blue-400 text-[11px]"></i>
            <span class="truncate">${escapeHTML(ev.summary)}</span>
          </div>
          <div class="text-[10px] text-blue-300/70 flex items-center gap-2 mt-0.5">
            <span><i class="fa-solid fa-clock text-[9px] mr-0.5"></i>${timeStr}</span>
            ${ev.description ? `<span class="truncate opacity-75 max-w-[200px]">${escapeHTML(ev.description)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
          ${ev.link ? `<a href="${ev.link}" target="_blank" class="p-1 text-blue-400 hover:text-blue-200" title="Open in Google Calendar"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>` : ''}
          <button onclick="importGCalEventAsTask('${ev.id}')" class="px-2 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-[10px] font-semibold transition" title="Add as a Chronos task">
            <i class="fa-solid fa-plus text-[9px] mr-1"></i>Import
          </button>
        </div>
      </div>`;
  }).join('');
}

async function importGCalEventAsTask(eventId) {
  if (!currentDayISO) return;
  const events = gcalEventsCache[currentDayISO] || [];
  const ev = events.find(e => e.id === eventId);
  if (!ev) return;

  const dayKey = `day_${currentDayISO}`;
  if (!plannerData.tasks[dayKey]) plannerData.tasks[dayKey] = [];

  // Check if already imported
  const exists = plannerData.tasks[dayKey].some(t => t.gcal_event_id === eventId || t.text === ev.summary);
  if (exists) {
    showToast('This event is already added to tasks.', 'info');
    return;
  }

  let due = null;
  if (ev.start && ev.start.includes('T')) {
    due = ev.start.slice(0, 16);
  } else {
    due = `${currentDayISO}T09:00`;
  }

  const newTask = {
    id: 't_' + Date.now(),
    text: ev.summary || 'Google Calendar Event',
    done: false,
    priority: 'medium',
    category: 'Meetings',
    due_time: due,
    recurrence: null,
    gcal_event_id: ev.id
  };

  plannerData.tasks[dayKey].push(newTask);
  renderDayTaskList();
  updateYearStats();

  try {
    await API.post('/api/tasks', {
      id: newTask.id,
      bucket_key: dayKey,
      text: newTask.text,
      done: false,
      priority: newTask.priority,
      category: newTask.category,
      due_time: newTask.due_time,
      recurrence: null,
      push_to_gcal: false
    });
    showToast('Imported Google event into Chronos tasks! 📋', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save imported task to database.', 'error');
  }
}

function closeDayModal() {
  document.getElementById('dayModal').classList.add('hidden');
  currentDayISO = null;
  if (currentView === 'month') renderMonthTabContent();
  else renderDashboard();
}

let _dayNoteTimer;
async function saveDayNotes() {
  if (!currentDayISO) return;
  const dayKey = `day_${currentDayISO}`;
  const text = document.getElementById('dayNotesTextarea').value;
  plannerData.scratchpads[dayKey] = text;
  clearTimeout(_dayNoteTimer);
  _dayNoteTimer = setTimeout(async () => {
    try {
      await API.put(`/api/scratchpads/${dayKey}`, { content: text });
      const ind = document.getElementById('dayNoteSavedIndicator');
      ind.style.opacity = '1';
      setTimeout(() => ind.style.opacity = '0', 1200);
    } catch(e) {}
  }, 400);
}

function renderDayTaskList() {
  if (!currentDayISO) return;
  const dayKey = `day_${currentDayISO}`;
  const allTasks = plannerData.tasks[dayKey] || [];
  const container = document.getElementById('dayTaskList');

  // Apply active filters
  const tasks = allTasks.filter(taskMatchesFilter);

  if (tasks.length === 0) {
    const isFiltered = activeFilter.status !== 'all' || activeFilter.category !== 'all';
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-xs">
        <i class="fa-solid fa-calendar-plus text-2xl mb-2 text-slate-600 block"></i>
        ${isFiltered ? `No tasks match the active filters. <button onclick="resetAllFilters()" class="text-indigo-400 underline font-semibold ml-1">Clear filters</button>` : `No tasks yet. Click "+ Add Task" to schedule activities.`}
      </div>`;
    return;
  }

  container.innerHTML = tasks.map(t => `
    <div class="flex items-center justify-between bg-white/3 p-2.5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition">
      <div class="flex items-center gap-2.5 flex-1 min-w-0">
        <input type="checkbox" ${t.done?'checked':''} onchange="toggleTaskDone('${dayKey}','${t.id}')"
          class="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer flex-shrink-0" />
        <div class="min-w-0">
          <span class="text-xs ${t.done?'line-through text-slate-500':'text-slate-200'} block">${escapeHTML(t.text)}</span>
          <div class="flex flex-wrap items-center gap-2 mt-0.5">
            ${t.due_time ? `<span class="text-[10px] text-indigo-300 flex items-center gap-1"><i class="fa-solid fa-clock"></i>${formatDueTime(t.due_time)}</span>` : ''}
            ${t.recurrence ? `<span class="badge-recurring text-[9px] px-1.5 py-0.5 rounded"><i class="fa-solid fa-rotate mr-1"></i>${t.recurrence}</span>` : ''}
            ${t.gcal_event_id ? '<span class="text-[9px] text-blue-400"><i class="fa-brands fa-google mr-1"></i>G-Cal</span>' : ''}
            ${t.reminder_time ? '<span class="text-[9px] text-purple-300 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20" title="Email reminder scheduled"><i class="fa-solid fa-envelope mr-1"></i>Email Reminder</span>' : ''}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="text-[10px] px-2 py-0.5 rounded ${getPriorityBg(t.priority)}">${t.priority}</span>
        ${!t.gcal_event_id && gcalConnected && t.due_time ? `
          <button onclick="pushTaskToGCal('${dayKey}','${t.id}')" class="text-blue-400 hover:text-blue-300 p-1 transition" title="Push to Google Calendar">
            <i class="fa-brands fa-google text-xs"></i>
          </button>` : ''}
        <button onclick="deleteTask('${dayKey}','${t.id}')" class="text-slate-500 hover:text-rose-400 p-1 transition">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>
    </div>`).join('');
}

function navigateDay(offset) {
  if (!currentDayISO) return;
  const d = new Date(currentDayISO + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  const first = TARGET_MONTHS[0];
  const last  = TARGET_MONTHS[11];
  const minDate = new Date(first.year, first.monthIdx, 1);
  const maxDate = new Date(last.year, last.monthIdx + 1, 0);
  if (d < minDate || d > maxDate) {
    showToast('Reached planner boundary.', 'info'); return;
  }
  openDayModal(formatISODate(d.getFullYear(), d.getMonth(), d.getDate()));
}

