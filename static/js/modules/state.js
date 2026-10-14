/* ======================================================================
   CHRONOS PLANNER — MODULE: STATE & CONSTANTS
   ====================================================================== */

// Build dynamic 12-month range from current date
function buildTargetMonths() {
  const now  = new Date();
  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
  const icons = [
    "fa-champagne-glasses","fa-heart","fa-clover","fa-cloud-sun-rain",
    "fa-seedling","fa-sun","fa-umbrella-beach","fa-fire",
    "fa-leaf","fa-ghost","fa-wind","fa-snowflake"
  ];
  const gradients = [
    "from-indigo-600 to-purple-600","from-blue-600 to-indigo-600",
    "from-sky-600 to-teal-600","from-teal-600 to-indigo-600",
    "from-indigo-600 to-purple-600","from-blue-600 to-cyan-600",
    "from-cyan-600 to-blue-600","from-teal-600 to-emerald-600",
    "from-emerald-600 to-green-600","from-amber-600 to-orange-600",
    "from-orange-600 to-rose-600","from-rose-600 to-pink-600"
  ];

  const months = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed

  for (let i = 0; i < 12; i++) {
    months.push({
      name: `${monthNames[m]} ${y}`,
      year: y,
      monthIdx: m,
      gradient: gradients[i],
      icon: icons[m],
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

const TARGET_MONTHS = buildTargetMonths();

// Global App State
let plannerData = { tasks: {}, scratchpads: {} };
let currentView = 'dashboard';
let currentSelectedMonth = null;
let currentSelectedMonthTab = 'weeks';
let currentDayISO = null;
let modalTaskTarget = null;
let gcalConnected = false;
let gcalEventsCache = {}; // { 'YYYY-MM-DD': [ {id, summary, start, end, ...} ] }
let isDarkMode = true;

// Filter State
let activeFilter = {
  status: 'all',     // 'all' | 'pending' | 'done' | 'gcal' | 'high'
  category: 'all',   // 'all' | 'Work' | 'Personal' | 'Health' | 'Finance' | 'Learning'
};

function setFilter(type, value) {
  activeFilter[type] = value;

  if (type === 'status') {
    document.querySelectorAll('[data-filter-group="status"]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter-val') === value);
    });
  } else if (type === 'category') {
    // Sync category dropdown or category tag pills
    const sel = document.getElementById('categoryFilterSelect');
    if (sel) sel.value = value;
    document.querySelectorAll('[data-filter-group="category"]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter-val') === value);
    });
  }

  // Toggle reset button
  const isFiltered = activeFilter.status !== 'all' || activeFilter.category !== 'all';
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) resetBtn.classList.toggle('hidden', !isFiltered);

  // Update views
  if (currentView === 'dashboard') {
    renderDashboard();
    renderLandingTaskFeeds();
  } else if (currentView === 'month') {
    renderMonthTabContent();
  }

  if (currentDayISO) renderDayTaskList();
}

function resetAllFilters() {
  activeFilter.status = 'all';
  activeFilter.category = 'all';
  document.querySelectorAll('[data-filter-group="status"]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter-val') === 'all');
  });
  document.querySelectorAll('[data-filter-group="category"]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter-val') === 'all');
  });
  const sel = document.getElementById('categoryFilterSelect');
  if (sel) sel.value = 'all';
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) resetBtn.classList.add('hidden');

  if (currentView === 'dashboard') {
    renderDashboard();
    renderLandingTaskFeeds();
  } else if (currentView === 'month') {
    renderMonthTabContent();
  }
  if (currentDayISO) renderDayTaskList();
}

function taskMatchesFilter(task) {
  if (!task) return false;

  // Category filter
  if (activeFilter.category !== 'all') {
    if ((task.category || 'Work').toLowerCase() !== activeFilter.category.toLowerCase()) return false;
  }

  // Status / Priority filter
  if (activeFilter.status === 'pending') {
    return !task.done;
  } else if (activeFilter.status === 'done') {
    return !!task.done;
  } else if (activeFilter.status === 'high') {
    return task.priority === 'high';
  } else if (activeFilter.status === 'gcal') {
    return !!task.gcal_event_id;
  }

  return true;
}

function focusMobileSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function openQuickAddModal() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  currentDayISO = currentDayISO || todayISO;
  openAddTaskModal('day');
}
