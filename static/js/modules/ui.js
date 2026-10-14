// ── Search ──
function handleSearch(query) {
  const overlay   = document.getElementById('searchResultsOverlay');
  const container = document.getElementById('searchResultsList');
  const clearBtn  = document.getElementById('clearSearchBtn');
  const countBadge= document.getElementById('searchResultCount');
  query = query.trim().toLowerCase();

  if (!query) { overlay.classList.add('hidden'); clearBtn.classList.add('hidden'); return; }
  clearBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');

  let results = [];
  for (const [key, taskArray] of Object.entries(plannerData.tasks)) {
    taskArray.forEach(task => {
      if (task.text.toLowerCase().includes(query)) {
        results.push({ type: 'task', key, text: task.text, done: task.done, priority: task.priority });
      }
    });
  }
  for (const [key, noteText] of Object.entries(plannerData.scratchpads)) {
    if (noteText && noteText.toLowerCase().includes(query)) {
      results.push({ type: 'note', key, text: noteText });
    }
  }

  // Also search Google Calendar events
  for (const [isoDate, evArray] of Object.entries(gcalEventsCache)) {
    evArray.forEach(ev => {
      const summary = ev.summary || '';
      const desc = ev.description || '';
      if (summary.toLowerCase().includes(query) || desc.toLowerCase().includes(query)) {
        results.push({
          type: 'gcal',
          key: `day_${isoDate}`,
          text: summary + (desc ? ` — ${desc}` : ''),
          link: ev.link,
          isoDate: isoDate
        });
      }
    });
  }

  countBadge.innerText = `${results.length} found`;

  if (results.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-500 text-sm">No results for "${query}".</div>`;
    return;
  }

  container.innerHTML = results.map(r => {
    let locationLabel = r.key;
    let actionOnClick = '';

    if (r.key.startsWith('day_')) {
      const iso = r.key.replace('day_','');
      locationLabel = `Day Log (${iso})`;
      actionOnClick = `openDayModal('${iso}'); closeSearch();`;
    } else if (r.key.startsWith('month_')) {
      const parts = r.key.split('_');
      const target = TARGET_MONTHS.findIndex(m => m.year===+parts[1] && m.monthIdx===+parts[2]);
      locationLabel = `Month: ${TARGET_MONTHS[target]?.name||r.key}`;
      actionOnClick = `navigateToMonth(${target}); closeSearch();`;
    } else if (r.key.startsWith('week_')) {
      locationLabel = `Week Target (${r.key})`;
      actionOnClick = `closeSearch();`;
    }

    let badgeClass = 'bg-indigo-500/20 text-indigo-300';
    let badgeText = r.type;
    if (r.type === 'note') {
      badgeClass = 'bg-amber-500/20 text-amber-300';
    } else if (r.type === 'gcal') {
      badgeClass = 'bg-blue-500/20 text-blue-300';
      badgeText = 'Google Calendar';
    }

    return `
      <div onclick="${actionOnClick}" class="p-3 bg-white/3 hover:bg-white/5 border border-white/5 rounded-xl cursor-pointer transition flex items-start justify-between">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 text-xs">
            <span class="font-semibold text-indigo-400">${locationLabel}</span>
            <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${badgeClass}">${badgeText}</span>
          </div>
          <p class="text-sm text-slate-200 line-clamp-2">${escapeHTML(r.text)}</p>
        </div>
        <i class="fa-solid fa-chevron-right text-xs text-slate-500 mt-1 ml-2 flex-shrink-0"></i>
      </div>`;
  }).join('');
}

function clearSearch() { document.getElementById('searchInput').value = ''; handleSearch(''); }
function closeSearch() { document.getElementById('searchResultsOverlay').classList.add('hidden'); }

// ── Stats Modal ──
function updateYearStats() {
  let total = 0, completed = 0;
  for (const arr of Object.values(plannerData.tasks)) {
    total += arr.length;
    completed += arr.filter(t => t.done).length;
  }
  const pct = total > 0 ? Math.round((completed/total)*100) : 0;
  document.getElementById('totalYearTasks').innerText   = total;
  document.getElementById('completedYearTasks').innerText = completed;
  document.getElementById('yearCompletionPct').innerText  = `${pct}%`;
}

function openStatsModal() {
  const container = document.getElementById('statsModalBody');
  let total = 0, completed = 0, recurring = 0, gcalSynced = 0;
  let monthBreakdownHTML = '';

  TARGET_MONTHS.forEach(m => {
    const monthKey = `month_${m.year}_${m.monthIdx}`;
    const weeks = getWeeksForMonth(m.year, m.monthIdx);
    let mTotal = 0, mDone = 0;

    const allTasks = (plannerData.tasks[monthKey] || []).concat(
      weeks.flatMap(w => (plannerData.tasks[`week_${m.year}_${m.monthIdx}_${w.weekId}`] || []).concat(
        w.days.flatMap(d => plannerData.tasks[`day_${d.isoDate}`] || [])
      ))
    );
    mTotal = allTasks.length;
    mDone  = allTasks.filter(t => t.done).length;
    recurring   += allTasks.filter(t => t.recurrence).length;
    gcalSynced  += allTasks.filter(t => t.gcal_event_id).length;
    total     += mTotal;
    completed += mDone;
    const pct = mTotal > 0 ? Math.round((mDone/mTotal)*100) : 0;

    monthBreakdownHTML += `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-slate-300 font-medium">${m.name}</span>
          <span class="text-slate-400">${mDone}/${mTotal} (${pct}%)</span>
        </div>
        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r ${m.gradient} rounded-full" style="width:${pct}%"></div>
        </div>
      </div>`;
  });

  const totalPct = total > 0 ? Math.round((completed/total)*100) : 0;
  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center bg-white/3 p-4 rounded-xl border border-white/5">
      <div><span class="text-xs text-slate-400 block">Total Tasks</span><span class="text-2xl font-bold text-white">${total}</span></div>
      <div><span class="text-xs text-slate-400 block">Completed</span><span class="text-2xl font-bold text-emerald-400">${completed}</span></div>
      <div><span class="text-xs text-slate-400 block">Recurring</span><span class="text-2xl font-bold text-purple-400">${recurring}</span></div>
      <div><span class="text-xs text-slate-400 block">G-Cal Synced</span><span class="text-2xl font-bold text-blue-400">${gcalSynced}</span></div>
    </div>
    <div class="flex items-center gap-3 p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/20">
      <div class="flex-1">
        <div class="flex justify-between text-xs mb-1"><span class="font-semibold text-slate-200">Overall Progress</span><span class="text-indigo-400 font-bold">${totalPct}%</span></div>
        <div class="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all" style="width:${totalPct}%"></div>
        </div>
      </div>
    </div>
    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">12-Month Breakdown</h4>
    <div class="space-y-3 max-h-64 overflow-y-auto pr-1">${monthBreakdownHTML}</div>`;

  document.getElementById('statsModal').classList.remove('hidden');
}

function closeStatsModal() { document.getElementById('statsModal').classList.add('hidden'); }

// ── Data Modal ──
function openDataModal() { document.getElementById('dataModal').classList.remove('hidden'); }
function closeDataModal() { document.getElementById('dataModal').classList.add('hidden'); }

function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(plannerData, null, 2));
  const a = document.createElement('a');
  a.href = dataStr;
  a.download = `Chronos_Backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  showToast('Backup exported!');
}

function importDataJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.tasks && imported.scratchpads) {
        await API.post('/api/import', imported);
        plannerData = imported;
        renderDashboard(); updateYearStats(); closeDataModal();
        showToast('Backup restored!');
      } else {
        showToast('Invalid backup format.', 'error');
      }
    } catch (err) { showToast('Error restoring backup.', 'error'); }
  };
  reader.readAsText(file);
}

async function clearAllData() {
  try {
    await API.delete('/api/data');
    await seedSampleData();
    renderDashboard(); updateYearStats(); closeDataModal();
    showToast('Reset to sample tasks!', 'info');
  } catch (err) { showToast('Failed to clear data.', 'error'); }
}

// ── Theme ──
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.classList.toggle('dark', isDarkMode);
  const icon = isDarkMode ? 'fa-moon' : 'fa-sun';
  const colorClass = isDarkMode ? '' : 'text-amber-500';
  document.getElementById('themeToggleDesktop').innerHTML = `<i class="fa-solid ${icon} ${colorClass}"></i>`;
  document.getElementById('themeToggleMobile').innerHTML  = `<i class="fa-solid ${icon} ${colorClass}"></i>`;
}

// ── UI Helpers ──
function getPriorityBg(p) {
  if (p==='high')   return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
  if (p==='medium') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
  return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
}

function formatDueTime(dueTime) {
  if (!dueTime) return '';
  try {
    const d = new Date(dueTime);
    return d.toLocaleString('en-IN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return dueTime; }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g,
    tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;' }[tag]||tag));
}

function showToast(message, type = "success") {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  let icon = 'fa-circle-check text-emerald-400';
  if (type === 'error') icon = 'fa-circle-xmark text-rose-400';
  if (type === 'info')  icon = 'fa-circle-info text-indigo-400';

  toast.className = `p-3 px-4 rounded-xl glass bg-slate-900/95 border border-white/8 shadow-2xl text-xs text-slate-200 flex items-center gap-2 pointer-events-auto transition-all transform translate-y-2 opacity-0`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2','opacity-0');
  });
  setTimeout(() => {
    toast.classList.add('opacity-0','translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
