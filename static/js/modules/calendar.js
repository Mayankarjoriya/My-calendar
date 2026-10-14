/* ======================================================================
   CHRONOS PLANNER — MODULE: CALENDAR ENGINE
   ====================================================================== */

// ── Calendar Math ──
function getDaysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}
function getDayName(year, monthIdx, dayNum) {
  return new Date(year, monthIdx, dayNum).toLocaleDateString('en-US', { weekday: 'short' });
}
function getFullDayName(year, monthIdx, dayNum) {
  return new Date(year, monthIdx, dayNum).toLocaleDateString('en-US', { weekday: 'long' });
}
function formatISODate(year, monthIdx, dayNum) {
  return `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
}

function getWeeksForMonth(year, monthIdx) {
  const totalDays = getDaysInMonth(year, monthIdx);
  const weeks = [];
  let currentWeekDays = [];
  let weekNumber = 1;

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, monthIdx, day);
    currentWeekDays.push({
      dayNum: day,
      dayName: getDayName(year, monthIdx, day),
      isoDate: formatISODate(year, monthIdx, day),
      dateObj
    });
    if (dateObj.getDay() === 0 || day === totalDays) {
      weeks.push({
        weekId: `w${weekNumber}`,
        weekNum: weekNumber,
        label: `Week ${weekNumber} (${currentWeekDays[0].dayName} ${currentWeekDays[0].dayNum} – ${currentWeekDays[currentWeekDays.length-1].dayName} ${currentWeekDays[currentWeekDays.length-1].dayNum})`,
        startDay: currentWeekDays[0].dayNum,
        endDay: currentWeekDays[currentWeekDays.length-1].dayNum,
        days: currentWeekDays
      });
      currentWeekDays = [];
      weekNumber++;
    }
  }
  return weeks;
}

// ── View Navigation ──
function navigateToDashboard() {
  currentView = 'dashboard';
  currentSelectedMonth = null;
  document.getElementById('viewDashboard').classList.remove('hidden');
  document.getElementById('viewMonth').classList.add('hidden');
  renderDashboard();
  renderLandingTaskFeeds();
  renderBreadcrumbs();
}

function navigateToMonth(idx) {
  currentSelectedMonth = TARGET_MONTHS[idx];
  currentView = 'month';
  currentSelectedMonthTab = 'weeks';
  document.getElementById('viewDashboard').classList.add('hidden');
  document.getElementById('viewMonth').classList.remove('hidden');
  renderMonthHeader();
  renderMonthTabContent();
  renderBreadcrumbs();
}

function renderBreadcrumbs() {
  const nav = document.getElementById('breadcrumbs');
  if (!nav) return;
  let html = `<span onclick="navigateToDashboard()" class="cursor-pointer hover:text-indigo-400 flex items-center gap-1.5"><i class="fa-solid fa-house text-xs"></i> 12 Months</span>`;
  if (currentView === 'month' && currentSelectedMonth) {
    html += ` <i class="fa-solid fa-chevron-right text-[10px] text-slate-600 mx-2"></i> `;
    html += `<span class="text-indigo-400 font-semibold">${currentSelectedMonth.name}</span>`;
  }
  nav.innerHTML = html;
}

// ── Landing Page Due & Upcoming Tasks Feeds ──
function renderLandingTaskFeeds() {
  const dueContainer = document.getElementById('landingDueTasksList');
  const upcomingContainer = document.getElementById('landingUpcomingTasksList');
  if (!dueContainer || !upcomingContainer) return;

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  const allTasks = [];
  for (const [key, tList] of Object.entries(plannerData.tasks)) {
    (tList || []).forEach(t => {
      allTasks.push({ ...t, bucket_key: key });
    });
  }

  // Filter tasks based on activeFilter
  const filtered = allTasks.filter(t => taskMatchesFilter(t));

  // Overdue / Due Today tasks
  const dueTasks = filtered.filter(t => {
    if (t.done) return false;
    if (t.due_time) {
      const taskDate = t.due_time.slice(0, 10);
      return taskDate <= todayISO;
    }
    if (t.bucket_key === `day_${todayISO}`) return true;
    return false;
  }).sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''));

  // Upcoming tasks (due after today)
  const upcomingTasks = filtered.filter(t => {
    if (t.done) return false;
    if (t.due_time) {
      const taskDate = t.due_time.slice(0, 10);
      return taskDate > todayISO;
    }
    if (t.bucket_key.startsWith('day_')) {
      const taskDate = t.bucket_key.replace('day_', '');
      return taskDate > todayISO;
    }
    return false;
  }).sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''));

  const countBadge = document.getElementById('landingDueCount');
  if (countBadge) countBadge.innerText = `${dueTasks.length} Due`;

  const upBadge = document.getElementById('landingUpcomingCount');
  if (upBadge) upBadge.innerText = `${upcomingTasks.length} Upcoming`;

  if (dueTasks.length === 0) {
    dueContainer.innerHTML = `
      <div class="text-center py-6 text-slate-500 text-xs">
        <i class="fa-solid fa-circle-check text-emerald-400 text-lg mb-1 block"></i>
        No urgent or due tasks! You're completely caught up.
      </div>`;
  } else {
    dueContainer.innerHTML = dueTasks.slice(0, 8).map(t => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-white/5 hover:border-rose-500/30 transition group">
        <label class="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
          <input type="checkbox" onchange="toggleTaskDone('${t.bucket_key}','${t.id}')" class="rounded text-indigo-600 focus:ring-0">
          <div class="truncate">
            <span class="text-xs font-medium text-slate-200 block truncate group-hover:text-rose-300 transition">${escapeHTML(t.text)}</span>
            <span class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
              ${t.due_time ? `<span class="text-rose-400"><i class="fa-regular fa-clock mr-1"></i>${formatDueTime(t.due_time)}</span>` : '<span class="text-amber-400">Due Today</span>'}
              <span class="text-slate-500">•</span>
              <span class="text-slate-400">${t.category || 'Work'}</span>
            </span>
          </div>
        </label>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${getPriorityBg(t.priority)} ml-2 flex-shrink-0">${t.priority}</span>
      </div>
    `).join('');
  }

  if (upcomingTasks.length === 0) {
    upcomingContainer.innerHTML = `
      <div class="text-center py-6 text-slate-500 text-xs">
        <i class="fa-regular fa-calendar text-indigo-400 text-lg mb-1 block"></i>
        No scheduled future tasks. Click <strong>+</strong> to plan ahead.
      </div>`;
  } else {
    upcomingContainer.innerHTML = upcomingTasks.slice(0, 8).map(t => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-white/5 hover:border-indigo-500/30 transition group">
        <label class="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
          <input type="checkbox" onchange="toggleTaskDone('${t.bucket_key}','${t.id}')" class="rounded text-indigo-600 focus:ring-0">
          <div class="truncate">
            <span class="text-xs font-medium text-slate-200 block truncate group-hover:text-indigo-300 transition">${escapeHTML(t.text)}</span>
            <span class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
              ${t.due_time ? `<span class="text-indigo-400"><i class="fa-regular fa-calendar-check mr-1"></i>${formatDueTime(t.due_time)}</span>` : ''}
              <span class="text-slate-400">${t.category || 'Work'}</span>
            </span>
          </div>
        </label>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${getPriorityBg(t.priority)} ml-2 flex-shrink-0">${t.priority}</span>
      </div>
    `).join('');
  }
}

// ── Dashboard Render ──
function renderDashboard() {
  const grid = document.getElementById('monthsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const today = new Date();

  TARGET_MONTHS.forEach((m, idx) => {
    const monthKey = `month_${m.year}_${m.monthIdx}`;
    const monthTasks = (plannerData.tasks[monthKey] || []).filter(t => taskMatchesFilter(t));
    const weeks = getWeeksForMonth(m.year, m.monthIdx);
    let total = monthTasks.length, done = monthTasks.filter(t => t.done).length;

    weeks.forEach(w => {
      const wTasks = (plannerData.tasks[`week_${m.year}_${m.monthIdx}_${w.weekId}`] || []).filter(t => taskMatchesFilter(t));
      total += wTasks.length; done += wTasks.filter(t => t.done).length;
      w.days.forEach(d => {
        const dTasks = (plannerData.tasks[`day_${d.isoDate}`] || []).filter(t => taskMatchesFilter(t));
        total += dTasks.length; done += dTasks.filter(t => t.done).length;
      });
    });

    const pct = total > 0 ? Math.round((done/total)*100) : 0;
    const isCurrentMonth = m.year === today.getFullYear() && m.monthIdx === today.getMonth();

    const card = document.createElement('div');
    card.className = `glass rounded-2xl p-5 card-hover cursor-pointer border flex flex-col justify-between space-y-4 group relative overflow-hidden ${isCurrentMonth ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'border-white/5'}`;
    card.onclick = () => navigateToMonth(idx);

    // Recurring tasks count
    const recurringCount = [...(plannerData.tasks[monthKey] || []), ...weeks.flatMap(w =>
      (plannerData.tasks[`week_${m.year}_${m.monthIdx}_${w.weekId}`] || []).concat(
        w.days.flatMap(d => plannerData.tasks[`day_${d.isoDate}`] || [])
      )
    )].filter(t => t.recurrence).length;

    card.innerHTML = `
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${m.gradient}"></div>
      ${isCurrentMonth ? '<div class="absolute top-2.5 right-2.5 text-[10px] bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40 font-bold uppercase tracking-wider">CURRENT</div>' : ''}

      <div>
        <div class="flex items-center justify-between mb-3 mt-1">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr ${m.gradient} flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <i class="fa-solid ${m.icon} text-base"></i>
            </div>
            <div>
              <h3 class="font-bold text-base text-white group-hover:text-indigo-400 transition-colors">${m.name}</h3>
              <span class="text-xs text-slate-400">${getDaysInMonth(m.year,m.monthIdx)} Days · ${weeks.length} Weeks</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/5 text-slate-300">${total} tasks</span>
            ${recurringCount > 0 ? `<span class="text-xs badge-recurring px-2 py-0.5 rounded-full"><i class="fa-solid fa-rotate text-[9px] mr-1"></i>${recurringCount}</span>` : ''}
          </div>
        </div>

        <p class="text-xs text-slate-400 line-clamp-2 h-8 leading-4">
          ${plannerData.scratchpads[monthKey] || '<span class="italic opacity-50">Click to explore weeks & daily agendas...</span>'}
        </p>
      </div>

      <div class="space-y-1.5 pt-2 border-t border-white/5">
        <div class="flex justify-between text-xs font-medium">
          <span class="text-slate-400">Progress</span>
          <span class="${pct===100 ? 'text-emerald-400 font-bold' : 'text-indigo-400'}">${done}/${total} (${pct}%)</span>
        </div>
        <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r ${m.gradient} transition-all duration-500 rounded-full" style="width:${pct}%"></div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ── Month Header ──
function renderMonthHeader() {
  if (!currentSelectedMonth) return;
  const m = currentSelectedMonth;
  const totalDays = getDaysInMonth(m.year, m.monthIdx);
  const weeks = getWeeksForMonth(m.year, m.monthIdx);

  const monthKey = `month_${m.year}_${m.monthIdx}`;
  const monthTasks = (plannerData.tasks[monthKey] || []).filter(t => taskMatchesFilter(t));
  let totalTasks = monthTasks.length;
  let doneTasks  = monthTasks.filter(t => t.done).length;

  weeks.forEach(w => {
    const wKey = `week_${m.year}_${m.monthIdx}_${w.weekId}`;
    const wTasks = (plannerData.tasks[wKey] || []).filter(t => taskMatchesFilter(t));
    totalTasks += wTasks.length; doneTasks += wTasks.filter(t => t.done).length;
    w.days.forEach(d => {
      const dTasks = (plannerData.tasks[`day_${d.isoDate}`] || []).filter(t => taskMatchesFilter(t));
      totalTasks += dTasks.length; doneTasks += dTasks.filter(t => t.done).length;
    });
  });

  const completionPct = totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0;
  const targetIdx = TARGET_MONTHS.findIndex(x => x.year === m.year && x.monthIdx === m.monthIdx);
  const prevIdx = (targetIdx - 1 + 12) % 12;
  const nextIdx = (targetIdx + 1) % 12;

  document.getElementById('monthHeader').innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center space-x-4">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr ${m.gradient} flex items-center justify-center text-white text-2xl shadow-xl shadow-indigo-600/30">
          <i class="fa-solid ${m.icon}"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-extrabold text-white">${m.name}</h2>
            <div class="flex items-center gap-1 ml-2">
              <button onclick="navigateToMonth(${prevIdx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs" title="Previous Month">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <button onclick="navigateToMonth(${nextIdx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs" title="Next Month">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">
            ${totalDays} Days · ${weeks.length} Weeks Breakdown
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="bg-slate-900/80 px-4 py-2.5 rounded-xl border border-white/5 flex items-center gap-4 text-xs">
          <div>
            <span class="text-slate-400 block text-[10px]">TASKS</span>
            <span class="font-bold text-white text-sm">${doneTasks}/${totalTasks}</span>
          </div>
          <div class="h-6 w-px bg-white/5"></div>
          <div>
            <span class="text-slate-400 block text-[10px]">COMPLETION</span>
            <span class="font-bold ${completionPct===100?'text-emerald-400':'text-indigo-400'} text-sm">${completionPct}%</span>
          </div>
        </div>
        <button onclick="openAddTaskModal('month')" class="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition">
          <i class="fa-solid fa-plus"></i><span class="hidden sm:inline">Add Goal</span>
        </button>
      </div>
    </div>
  `;
}

function switchMonthTab(tab) {
  currentSelectedMonthTab = tab;
  ['weeks', 'monthTasks', 'gcal'].forEach(t => {
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    if (btn) {
      if (t === tab) { btn.className = btn.className.replace('tab-inactive','').trim() + ' tab-active'; }
      else { btn.className = btn.className.replace('tab-active','').trim() + ' tab-inactive'; }
    }
    const content = document.getElementById(`month${t.charAt(0).toUpperCase() + t.slice(1)}Content`);
    if (content) content.classList.toggle('hidden', t !== tab);
  });
  renderMonthTabContent();
  if (tab === 'gcal') loadGCalEvents();
}

function updateMonthTaskBadge() {
  if (!currentSelectedMonth) return;
  const key = `month_${currentSelectedMonth.year}_${currentSelectedMonth.monthIdx}`;
  const el = document.getElementById('monthTaskBadgeCount');
  if (el) el.innerText = (plannerData.tasks[key] || []).length;
}

function renderMonthTabContent() {
  if (!currentSelectedMonth) return;
  const m = currentSelectedMonth;

  if (currentSelectedMonthTab === 'weeks') {
    const weeksList = document.getElementById('weeksList');
    weeksList.innerHTML = '';
    const weeks = getWeeksForMonth(m.year, m.monthIdx);
    const today = new Date();

    weeks.forEach(w => {
      const wKey = `week_${m.year}_${m.monthIdx}_${w.weekId}`;
      const weekTasks = (plannerData.tasks[wKey] || []).filter(t => taskMatchesFilter(t));

      let weekTasksHTML = '';
      if (weekTasks.length > 0) {
        weekTasksHTML = `<div class="mt-2 space-y-1.5">
          ${weekTasks.map(t => `
            <div class="flex items-center justify-between bg-white/3 p-2 rounded-lg border border-white/5 text-xs">
              <label class="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" ${t.done?'checked':''} onchange="toggleTaskDone('${wKey}','${t.id}')" class="rounded text-indigo-600 focus:ring-0">
                <span class="${t.done?'line-through text-slate-500':'text-slate-200'}">${escapeHTML(t.text)}</span>
                ${t.recurrence ? `<span class="badge-recurring text-[9px] px-1.5 py-0.5 rounded"><i class="fa-solid fa-rotate mr-1"></i>${t.recurrence}</span>` : ''}
              </label>
              <div class="flex items-center gap-1">
                ${t.gcal_event_id ? '<i class="fa-brands fa-google text-blue-400 text-[10px]" title="Synced to Google Calendar"></i>' : ''}
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${getPriorityBg(t.priority)}">${t.priority}</span>
              </div>
            </div>`).join('')}
        </div>`;
      }

      // Fancy animated day cells with shine and interactive hover
      let daysGridHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">`;
      w.days.forEach(d => {
        const dKey = `day_${d.isoDate}`;
        const dayTasks = (plannerData.tasks[dKey] || []).filter(t => taskMatchesFilter(t));
        const hasNotes = !!plannerData.scratchpads[dKey];
        const doneCount = dayTasks.filter(t => t.done).length;
        const isWeekend = d.dayName === 'Sat' || d.dayName === 'Sun';
        const isToday = d.isoDate === formatISODate(today.getFullYear(), today.getMonth(), today.getDate());
        const hasDue = dayTasks.some(t => t.due_time);
        const hasRecurring = dayTasks.some(t => t.recurrence);
        const dayGCalEvents = gcalEventsCache[d.isoDate] || [];

        daysGridHTML += `
          <div onclick="openDayModal('${d.isoDate}')"
            class="day-cell border rounded-xl p-2.5 cursor-pointer card-hover flex flex-col justify-between min-h-[114px] relative group
              ${isToday ? 'border-indigo-500/60 bg-indigo-600/10 shadow-lg shadow-indigo-500/15' : 'border-white/5 bg-slate-900/60 hover:border-indigo-500/40'}">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold ${isWeekend?'text-amber-400':isToday?'text-indigo-400 font-extrabold':'text-slate-400'}">${d.dayName}</span>
                <span class="text-sm font-extrabold ${isToday ? 'w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs shadow-md' : 'text-white'}">${d.dayNum}</span>
              </div>

              ${dayGCalEvents.length > 0 ? `
                <div class="mb-1">
                  <span class="gcal-event-pill text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 truncate" title="${escapeHTML(dayGCalEvents[0].summary)}">
                    <i class="fa-brands fa-google text-[8px] text-blue-400 flex-shrink-0"></i>
                    <span class="truncate">${escapeHTML(dayGCalEvents[0].summary)}</span>
                    ${dayGCalEvents.length > 1 ? `<span class="opacity-75 text-[8px]">+${dayGCalEvents.length-1}</span>` : ''}
                  </span>
                </div>
              ` : ''}

              <div class="space-y-1">
                ${dayTasks.slice(0,2).map(t => `
                  <div class="text-[10px] text-slate-300 truncate flex items-center gap-1 group/item">
                    <span class="w-1.5 h-1.5 rounded-full ${t.priority==='high'?'dot-high':t.priority==='medium'?'dot-medium':'dot-low'} flex-shrink-0"></span>
                    <span class="${t.done ? 'line-through text-slate-500' : ''} truncate">${escapeHTML(t.text)}</span>
                  </div>`).join('')}
                ${dayTasks.length > 2 ? `<span class="text-[9px] text-slate-500 font-medium">+${dayTasks.length-2} more</span>` : ''}
              </div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5 mt-1">
              <span class="${doneCount === dayTasks.length && dayTasks.length > 0 ? 'text-emerald-400 font-medium' : ''}">${dayTasks.length > 0 ? `${doneCount}/${dayTasks.length}` : '—'}</span>
              <div class="flex items-center gap-1">
                ${hasRecurring ? '<i class="fa-solid fa-rotate text-[8px] text-purple-400" title="Recurring task"></i>' : ''}
                ${hasDue ? '<i class="fa-regular fa-clock text-[8px] text-amber-400" title="Has due time"></i>' : ''}
                ${hasNotes ? '<i class="fa-solid fa-note-sticky text-[8px] text-indigo-400" title="Has notes"></i>' : ''}
              </div>
            </div>
          </div>
        `;
      });
      daysGridHTML += `</div>`;

      const weekCard = document.createElement('div');
      weekCard.className = 'glass p-4 rounded-2xl border border-white/5';
      weekCard.innerHTML = `
        <div class="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div class="flex items-center space-x-2">
            <span class="w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">W${w.weekNum}</span>
            <h3 class="font-bold text-sm text-white">${w.label}</h3>
          </div>
          <button onclick="openAddTaskModal('week', '${wKey}')" class="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
            <i class="fa-solid fa-plus text-[10px]"></i> Week Target
          </button>
        </div>
        ${weekTasksHTML}
        ${daysGridHTML}
      `;
      weeksList.appendChild(weekCard);
    });

  } else if (currentSelectedMonthTab === 'monthTasks') {
    renderMonthTasksTab();
  }
}

function renderMonthTasksTab() {
  const m = currentSelectedMonth;
  const key = `month_${m.year}_${m.monthIdx}`;
  const tasks = (plannerData.tasks[key] || []).filter(t => taskMatchesFilter(t));
  const container = document.getElementById('monthTasksContainer');
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-xs">
        <i class="fa-solid fa-bullseye text-2xl mb-2 block opacity-40"></i>
        No monthly goals match active filters. Click "+ Add Goal" above.
      </div>`;
  } else {
    container.innerHTML = tasks.map(t => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition group">
        <label class="flex items-center gap-3 cursor-pointer flex-1">
          <input type="checkbox" ${t.done?'checked':''} onchange="toggleTaskDone('${key}','${t.id}')" class="rounded text-indigo-600 focus:ring-0">
          <div>
            <span class="text-sm font-medium ${t.done?'line-through text-slate-500':'text-slate-200'}">${escapeHTML(t.text)}</span>
            <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
              <span class="px-2 py-0.5 rounded bg-white/5">${t.category || 'General'}</span>
              ${t.due_time ? `<span class="text-amber-400"><i class="fa-regular fa-clock mr-1"></i>${formatDueTime(t.due_time)}</span>` : ''}
              ${t.recurrence ? `<span class="badge-recurring text-[9px] px-1.5 py-0.5 rounded"><i class="fa-solid fa-rotate mr-1"></i>${t.recurrence}</span>` : ''}
            </div>
          </div>
        </label>
        <div class="flex items-center gap-2">
          ${t.gcal_event_id ? '<span class="text-xs text-blue-400" title="Synced to Google Calendar"><i class="fa-brands fa-google"></i></span>' : ''}
          <span class="text-xs font-semibold px-2 py-0.5 rounded ${getPriorityBg(t.priority)}">${t.priority}</span>
          <button onclick="deleteTask('${key}','${t.id}')" class="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Load scratchpad
  const scratchpad = document.getElementById('monthScratchpad');
  if (scratchpad) scratchpad.value = plannerData.scratchpads[key] || '';
  updateMonthTaskBadge();
}

let saveTimeout = null;
function saveMonthScratchpad() {
  if (!currentSelectedMonth) return;
  const key = `month_${currentSelectedMonth.year}_${currentSelectedMonth.monthIdx}`;
  const text = document.getElementById('monthScratchpad').value;
  plannerData.scratchpads[key] = text;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await API.put(`/api/scratchpads/${encodeURIComponent(key)}`, { content: text });
      const el = document.getElementById('scratchpadSaveStatus');
      if (el) { el.classList.remove('opacity-0'); setTimeout(() => el.classList.add('opacity-0'), 1500); }
    } catch (e) { console.error('Failed to save scratchpad', e); }
  }, 600);
}
