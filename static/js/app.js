/* ======================================================================
   CHRONOS PLANNER — MAIN ORCHESTRATOR
   ====================================================================== */

// ── Init ──
window.onload = async function() {
  showToast('Loading your planner...', 'info');
  await loadPlannerData();
  renderDashboard();
  renderLandingTaskFeeds();
  updateYearStats();
  renderBreadcrumbs();
  await checkGCalStatus();

  // Handle URL params from OAuth callback
  const params = new URLSearchParams(window.location.search);
  if (params.get('gcal_connected') === 'true') {
    showToast('✅ Google Calendar connected!', 'success');
    history.replaceState({}, '', '/');
    openGCalModal();
  }
  if (params.get('gcal_error')) {
    showToast('Google Calendar connection failed: ' + params.get('gcal_error'), 'error');
    history.replaceState({}, '', '/');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch(); closeDayModal(); closeAddTaskModal();
      closeDataModal(); closeStatsModal(); closeGCalModal();
    }
    // Global Cmd+K / Ctrl+K shortcut for quick search
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });
};

// ── Data Loading & Seeding ──
async function loadPlannerData() {
  try {
    const data = await API.get('/api/data');
    const taskCount = Object.values(data.tasks).reduce((s, a) => s + a.length, 0);
    if (taskCount === 0 && Object.keys(data.scratchpads).length === 0) {
      await seedSampleData();
    } else {
      plannerData = data;
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    showToast('Could not connect to database. Is the server running?', 'error');
  }
}

function savePlannerData() {
  updateYearStats();
  renderLandingTaskFeeds();
}

async function seedSampleData() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const mKey = `month_${now.getFullYear()}_${now.getMonth()}`;

  const sampleTasks = {
    [mKey]: [
      { id:"t1", text:"Set up Google Calendar integration", done:false, priority:"high", category:"Work", due_time:null, recurrence:null },
      { id:"t2", text:"Review monthly budget and expenses", done:false, priority:"medium", category:"Finance", due_time:null, recurrence:null }
    ],
    [`day_${todayISO}`]: [
      { id:"td1", text:"Morning productivity sprint", done:false, priority:"high", category:"Work", due_time:`${todayISO}T09:00:00`, recurrence:null },
      { id:"td2", text:"30-min walk or fitness session", done:false, priority:"low", category:"Health", due_time:`${todayISO}T18:00:00`, recurrence:"daily" }
    ]
  };
  const sampleScratchpads = {
    [mKey]: `${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()} Focus:\n- Keep daily schedule organized\n- Review goals and upcoming deadlines\n- Sync tasks with Google Calendar`,
  };

  try {
    await API.post('/api/import', { tasks: sampleTasks, scratchpads: sampleScratchpads });
    plannerData = { tasks: sampleTasks, scratchpads: sampleScratchpads };
  } catch (err) {
    plannerData = { tasks: sampleTasks, scratchpads: sampleScratchpads };
  }
}
