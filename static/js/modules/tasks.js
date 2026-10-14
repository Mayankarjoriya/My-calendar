// ── Task CRUD ──
function openAddTaskModal(level, customKey = null) {
  modalTaskTarget = { level, customKey };
  const titleEl = document.getElementById('taskModalTitle');
  document.getElementById('taskInputText').value = '';
  document.getElementById('taskDueTime').value = '';
  document.getElementById('taskDueDateOnly').value = '';
  document.getElementById('taskDueTimeOnly').value = '09:00';
  document.getElementById('taskRecurrence').value = '';
  document.getElementById('taskPushToGCal').checked = false;
  document.getElementById('taskEnableEmailReminder').checked = false;
  document.getElementById('taskReminderPreset').value = '1day_before';
  const customContainer = document.getElementById('customReminderTimeContainer');
  if (customContainer) customContainer.classList.add('hidden');
  const emailOpts = document.getElementById('emailReminderOptions');
  if (emailOpts) emailOpts.classList.add('hidden');

  // Pre-fill date for day-level tasks or today
  let defaultDate = currentDayISO;
  if (!defaultDate) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    defaultDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  }

  if (defaultDate) {
    miniCalState.selectedISO = defaultDate;
    const [y, m] = defaultDate.split('-');
    miniCalState.viewYear = parseInt(y);
    miniCalState.viewMonth = parseInt(m) - 1;
    document.getElementById('taskDueDateOnly').value = defaultDate;
    document.getElementById('taskDueTime').value = `${defaultDate}T09:00`;
  }

  // Reset mini calendar visibility
  const widget = document.getElementById('miniCalendarWidget');
  if (widget) widget.classList.add('hidden');
  const label = document.getElementById('toggleMiniCalLabel');
  if (label) label.innerText = 'Show Calendar';
  renderMiniCalendar();

  if (level === 'month') {
    titleEl.innerHTML = `<i class="fa-solid fa-bullseye text-indigo-400"></i> Add Goal for ${currentSelectedMonth ? currentSelectedMonth.name : 'Month'}`;
  } else if (level === 'week') {
    titleEl.innerHTML = `<i class="fa-solid fa-calendar-week text-indigo-400"></i> Add Week Target`;
  } else {
    titleEl.innerHTML = `<i class="fa-solid fa-calendar-day text-indigo-400"></i> Add Task ${currentDayISO ? `(${currentDayISO})` : ''}`;
  }

  // Show GCal push option only if connected
  document.getElementById('gcalPushSection').classList.toggle('hidden', !gcalConnected);
  document.getElementById('addTaskModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskInputText').focus(), 100);
}

function closeAddTaskModal() {
  document.getElementById('addTaskModal').classList.add('hidden');
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const text     = document.getElementById('taskInputText').value.trim();
  const priority = document.getElementById('taskPrioritySelect').value;
  const category = document.getElementById('taskCategorySelect').value;
  const dueTime  = document.getElementById('taskDueTime').value || null;
  const recurrence = document.getElementById('taskRecurrence').value || null;
  const pushToGCal = document.getElementById('taskPushToGCal').checked && gcalConnected;
  const reminderTime = computeReminderTime(dueTime);

  if (!text) return;

  let key = '';
  if (modalTaskTarget.level === 'month') {
    key = `month_${currentSelectedMonth.year}_${currentSelectedMonth.monthIdx}`;
  } else if (modalTaskTarget.level === 'week') {
    key = modalTaskTarget.customKey;
  } else {
    key = `day_${currentDayISO}`;
  }

  if (!plannerData.tasks[key]) plannerData.tasks[key] = [];

  const newTask = {
    id: 't_' + Date.now(),
    text, done: false, priority, category,
    due_time: dueTime, recurrence, reminder_time: reminderTime, gcal_event_id: null
  };

  plannerData.tasks[key].push(newTask);
  closeAddTaskModal();

  if (modalTaskTarget.level === 'day') renderDayTaskList();
  else if (currentView === 'month') { renderMonthTabContent(); updateMonthTaskBadge(); }
  else renderDashboard();
  updateYearStats();

  try {
    const result = await API.post('/api/tasks', {
      id: newTask.id, bucket_key: key, text, done: false,
      priority, category, due_time: dueTime, recurrence, reminder_time: reminderTime, push_to_gcal: pushToGCal
    });
    if (result.gcal_event_id) {
      newTask.gcal_event_id = result.gcal_event_id;
      // re-render
      if (modalTaskTarget.level === 'day') renderDayTaskList();
      else if (currentView === 'month') renderMonthTabContent();
      showToast('Task saved, reminder scheduled & synced to Google! 📆', 'success');
    } else if (reminderTime) {
      showToast('Task saved & Email Reminder scheduled! ✉️', 'success');
    } else {
      showToast('Task created!', 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Task saved locally but failed to sync.', 'error');
  }
}

async function toggleTaskDone(key, taskId) {
  if (!plannerData.tasks[key]) return;
  const task = plannerData.tasks[key].find(t => t.id === taskId);
  if (!task) return;
  task.done = !task.done;

  // Energetic Confetti burst on completion!
  if (task.done && typeof FX !== 'undefined') {
    FX.fireConfetti();
  }

  updateYearStats();
  if (currentDayISO && key === `day_${currentDayISO}`) renderDayTaskList();
  else if (currentView === 'month') renderMonthTabContent();
  else {
    renderDashboard();
    renderLandingTaskFeeds();
  }
  try {
    await API.put(`/api/tasks/${taskId}`, { done: task.done });
  } catch (err) {
    task.done = !task.done;
    showToast('Failed to sync change.', 'error');
  }
}

async function deleteTask(key, taskId) {
  if (!plannerData.tasks[key]) return;
  const removed = plannerData.tasks[key].find(t => t.id === taskId);
  plannerData.tasks[key] = plannerData.tasks[key].filter(t => t.id !== taskId);
  updateYearStats();
  if (currentDayISO && key === `day_${currentDayISO}`) renderDayTaskList();
  else if (currentView === 'month') { renderMonthTabContent(); updateMonthTaskBadge(); }
  else renderDashboard();
  try {
    await API.delete(`/api/tasks/${taskId}`);
    showToast('Task deleted.', 'info');
  } catch (err) {
    if (removed) plannerData.tasks[key].push(removed);
    showToast('Failed to delete from database.', 'error');
  }
}

// ── Push Task to GCal manually ──
async function pushTaskToGCal(key, taskId) {
  const task = (plannerData.tasks[key] || []).find(t => t.id === taskId);
  if (!task || !task.due_time) return;

  showToast('Pushing to Google Calendar...', 'info');
  try {
    const startDT = task.due_time.length === 16 ? task.due_time + ':00' : task.due_time;
    const startD  = new Date(startDT);
    const endD    = new Date(startD.getTime() + 60 * 60 * 1000);
    const endDT   = endD.toISOString().slice(0,19);

    const result = await API.post('/api/google/events', {
      task_id: taskId,
      summary: task.text,
      description: `Category: ${task.category}\nPriority: ${task.priority}`,
      start_datetime: startDT,
      end_datetime: endDT,
      timezone: 'Asia/Kolkata',
      recurrence: task.recurrence,
      reminder_minutes: 30
    });

    task.gcal_event_id = result.event_id;
    renderDayTaskList();
    showToast('✅ Synced to Google Calendar!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to push to Google Calendar.', 'error');
  }
}

