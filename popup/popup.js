/* Popup UI. Talks only to `Store`, `Auth` and `Api` from ../lib/api.js. */

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const MAX_MINUTES = 99 * 60 + 59;

let hasToken = false;
let tokenEncrypted = true;
let settings = { defaultProject: '', lastProject: '' };
let timer = { status: 'idle' }; // idle | running | stopped
let projects = [];
let issues = [];
let selectedKey = null;
let pickedProject = null; // project chosen by hand while this popup is open
let tickHandle = null;
let measuredMinutes = 0;
let adjustedMinutes = 0;

/* ---------- helpers ---------- */

const elapsedMs = () =>
  (timer.accumulatedMs || 0) + (timer.status === 'running' ? Date.now() - timer.startedAt : 0);

const pad = (n) => String(n).padStart(2, '0');

function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

function jiraLink(issueKey) {
  const a = el('a', 'link', 'See in Jira');
  a.href = Api.issueUrl(issueKey);
  a.target = '_blank';
  a.rel = 'noopener';
  const arrow = el('span', null, ' ↗');
  arrow.setAttribute('aria-hidden', 'true');
  a.append(arrow);
  return a;
}

function issueCard(container) {
  const { issue } = timer;
  container.replaceChildren(
    el('span', 'project', issue.projectName),
    el('span', 'key', issue.key),
    el('span', 'summary', issue.summary),
    jiraLink(issue.key),
  );
}

function setMessage(selector, text) {
  const node = $(selector);
  node.textContent = text || '';
  node.hidden = !text;
}

function listNote(text, failed) {
  $('#issues').replaceChildren(el('div', failed ? 'list-note failed' : 'list-note', text));
}

/* The background script watches this stored value and repaints the toolbar icon. */
async function saveTimer() {
  await Store.set('timer', timer);
  notifyHost();
}

/* Only used by the prototype page, which draws its own toolbar icon. */
function notifyHost() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'jtt:state', status: timer.status }, '*');
  }
}

function show(name) {
  for (const view of document.querySelectorAll('.view')) {
    const active = view.id === 'view-' + name;
    view.hidden = !active;
    view.classList.toggle('enter', active);
  }
  clearInterval(tickHandle);
}

function fillProjectSelect(select, placeholder) {
  select.replaceChildren();
  if (placeholder) select.append(new Option(placeholder, ''));
  for (const project of projects) select.append(new Option(`${project.name} (${project.key})`, project.key));
}

async function ensureProjects(refresh = false) {
  if (projects.length && !refresh) return;
  projects = await Api.getProjects(refresh);
  fillProjectSelect($('#project'));
}

const hasProject = (key) => projects.some((project) => project.key === key);

/* ---------- 1. picker ---------- */

async function showPicker() {
  show('picker');
  $('#picker-ready').hidden = !hasToken;
  $('#picker-setup').hidden = hasToken;
  if (!hasToken) return;

  $('#search').value = '';
  $('#start').disabled = true;
  if (!projects.length) listNote('Loading projects…');
  try {
    await ensureProjects();
  } catch (error) {
    listNote(error.message, true);
    return;
  }
  if (!projects.length) {
    listNote('Your account cannot see any Jira projects.');
    return;
  }
  const preferred = [pickedProject, settings.defaultProject, settings.lastProject].find(hasProject);
  $('#project').value = preferred || projects[0].key;
  await loadIssues();
}

async function loadIssues() {
  const projectKey = $('#project').value;
  selectedKey = null;
  issues = [];
  $('#start').disabled = true;
  listNote('Loading tickets…');
  let result;
  try {
    result = await Api.getMyIssues(projectKey);
  } catch (error) {
    if ($('#project').value === projectKey) listNote(error.message, true);
    return;
  }
  if ($('#project').value !== projectKey) return; // a newer request superseded this one
  issues = result;
  renderIssues();
}

function renderIssues() {
  const query = $('#search').value.trim().toLowerCase();
  const visible = issues.filter(
    (issue) => !query || issue.key.toLowerCase().includes(query) || issue.summary.toLowerCase().includes(query),
  );

  if (!visible.length) {
    listNote(
      issues.length
        ? `No tickets match “${$('#search').value.trim()}”.`
        : 'No open tickets are assigned to you in this project.',
    );
  } else {
    $('#issues').replaceChildren(
      ...visible.map((issue) => {
        const row = el('label', 'row');
        const input = el('input');
        input.type = 'radio';
        input.name = 'issue';
        input.value = issue.key;
        input.checked = issue.key === selectedKey;
        const meta = el('span', 'meta');
        meta.append(el('span', 'key', issue.key));
        if (issue.status) meta.append(el('span', 'status', issue.status));
        row.append(
          input,
          meta,
          el('span', 'summary', issue.summary),
          jiraLink(issue.key),
          $('#check-icon').content.cloneNode(true),
        );
        return row;
      }),
    );
  }

  if (!visible.some((issue) => issue.key === selectedKey)) selectedKey = null;
  $('#start').disabled = !selectedKey;
}

async function startClock() {
  const issue = issues.find((i) => i.key === selectedKey);
  const project = projects.find((p) => p.key === $('#project').value);
  if (!issue || !project) return;
  const now = Date.now();
  timer = {
    status: 'running',
    issue: { ...issue, projectKey: project.key, projectName: project.name },
    startedAt: now,
    firstStartedAt: now,
    accumulatedMs: 0,
  };
  settings = { ...settings, lastProject: project.key };
  await Store.set('settings', settings);
  await saveTimer();
  showRunning();
}

/* ---------- 2. running ---------- */

function showRunning() {
  show('running');
  issueCard($('#running-card'));
  const started = new Date(timer.firstStartedAt || timer.startedAt);
  $('#started-at').textContent =
    'Started at ' + started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const paint = () => { $('#clock').textContent = formatClock(elapsedMs()); };
  paint();
  tickHandle = setInterval(paint, 250);
}

async function stopClock() {
  timer = { ...timer, status: 'stopped', accumulatedMs: elapsedMs(), startedAt: null };
  await saveTimer();
  showConfirm();
}

/* ---------- 3. confirm ---------- */

function showConfirm() {
  show('confirm');
  issueCard($('#confirm-card'));
  const ms = timer.accumulatedMs || 0;
  measuredMinutes = ms >= 1000 ? Math.max(1, Math.round(ms / 60000)) : 0;
  adjustedMinutes = measuredMinutes;
  $('#measured').textContent = 'Measured ' + formatClock(ms);
  $('#comment').value = '';
  setMessage('#confirm-error', '');
  setBusy(false);
  paintTime();
}

function paintTime() {
  $('#hours').value = Math.floor(adjustedMinutes / 60);
  $('#minutes').value = pad(adjustedMinutes % 60);
  $('#reset-time').hidden = adjustedMinutes === measuredMinutes;
  $('#update').disabled = adjustedMinutes < 1;
}

function setMinutes(value) {
  adjustedMinutes = Math.min(MAX_MINUTES, Math.max(0, value));
  paintTime();
}

function readTimeInputs() {
  const hours = parseInt($('#hours').value, 10) || 0;
  const minutes = parseInt($('#minutes').value, 10) || 0;
  setMinutes(hours * 60 + minutes);
}

function setBusy(busy) {
  const button = $('#update');
  button.replaceChildren();
  if (busy) button.append(el('span', 'spinner'));
  button.append(busy ? 'Updating…' : 'Update Jira');
  for (const id of ['#update', '#resume', '#cancel']) $(id).disabled = busy;
  if (!busy) $('#update').disabled = adjustedMinutes < 1;
}

async function resumeWork() {
  timer = { ...timer, status: 'running', startedAt: Date.now() };
  await saveTimer();
  showRunning();
}

async function cancelTimer() {
  timer = { status: 'idle' };
  await saveTimer();
  showPicker();
}

async function updateJira() {
  readTimeInputs();
  if (adjustedMinutes < 1) return;
  const { issue } = timer;
  const minutes = adjustedMinutes;
  setMessage('#confirm-error', '');
  setBusy(true);
  try {
    await Api.addWorklog(issue.key, minutes * 60, $('#comment').value.trim(), timer.firstStartedAt);
  } catch (error) {
    setMessage('#confirm-error', error.message);
    setBusy(false);
    return;
  }
  timer = { status: 'idle' };
  await saveTimer();
  show('done');
  $('#done-title').textContent = `${formatDuration(minutes)} logged`;
  $('#done-sub').textContent = `${issue.key} · ${issue.summary}`;
  $('#done-link').href = Api.issueUrl(issue.key);
}

/* ---------- settings ---------- */

function paintSettings() {
  const token = $('#token');
  token.placeholder = hasToken ? 'Saved. Paste a new token to replace it' : 'Paste your token';
  $('#remove-token').hidden = !hasToken;
  $('#token-hint').textContent =
    hasToken && !tokenEncrypted
      ? 'Stored in this browser without encryption, because secure storage is unavailable here.'
      : 'Kept encrypted in this browser. It is only sent to uHub.';

  const select = $('#default-project');
  if (projects.length) {
    fillProjectSelect(select, 'No default');
    select.value = hasProject(settings.defaultProject) ? settings.defaultProject : '';
    select.disabled = false;
  } else {
    select.replaceChildren(new Option(hasToken ? 'Projects could not be loaded' : 'Save your token to load projects', ''));
    select.disabled = true;
  }
}

async function showSettings() {
  show('settings');
  $('#token').value = '';
  $('#token').type = 'password';
  $('#toggle-token').textContent = 'Show';
  $('#save-settings').textContent = 'Save';
  setMessage('#settings-error', '');
  setMessage('#settings-status', '');
  paintSettings();
  if (hasToken && !projects.length) {
    try {
      await ensureProjects();
    } catch (error) {
      setMessage('#settings-error', error.message);
    }
    paintSettings();
  }
}

async function saveSettings() {
  const tokenValue = $('#token').value.trim();
  const button = $('#save-settings');
  setMessage('#settings-error', '');
  setMessage('#settings-status', '');

  if (!tokenValue && !hasToken) {
    setMessage('#settings-error', 'Enter your uHub personal token.');
    $('#token').focus();
    return;
  }

  if (tokenValue) {
    // Requested first, before any other await, so the browser still sees the click.
    const allowed = await Auth.requestAccess();
    if (!allowed) {
      setMessage('#settings-error', 'Allow access to jira.uhub.biz so the extension can reach your tickets.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Checking…';
    try {
      const account = await Auth.save(tokenValue);
      hasToken = true;
      tokenEncrypted = account.encrypted;
      $('#token').value = '';
      await ensureProjects(true);
      setMessage('#settings-status', `Connected as ${account.displayName}. Choose a default project, then save.`);
    } catch (error) {
      setMessage('#settings-error', error.message);
    }
    button.disabled = false;
    button.textContent = 'Save';
    paintSettings();
    return;
  }

  settings = { ...settings, defaultProject: $('#default-project').value };
  await Store.set('settings', settings);
  pickedProject = null;
  button.textContent = 'Saved';
  setTimeout(leaveSettings, 450);
}

async function removeToken() {
  await Auth.clear();
  hasToken = false;
  projects = [];
  $('#token').value = '';
  setMessage('#settings-error', '');
  setMessage('#settings-status', 'Token removed from this browser.');
  paintSettings();
}

function leaveSettings() {
  if (!$('#view-settings').hidden) showPicker();
}

/* ---------- wiring ---------- */

async function init() {
  const auth = await Auth.status();
  hasToken = auth.saved;
  tokenEncrypted = auth.encrypted;
  settings = await Store.get('settings', settings);
  timer = await Store.get('timer', timer);

  $('#open-settings').addEventListener('click', showSettings);
  $('#setup-settings').addEventListener('click', showSettings);
  $('#project').addEventListener('change', () => {
    pickedProject = $('#project').value;
    loadIssues();
  });
  $('#search').addEventListener('input', renderIssues);
  $('#issues').addEventListener('change', (event) => {
    selectedKey = event.target.value;
    $('#start').disabled = false;
  });
  $('#issues').addEventListener('dblclick', (event) => {
    if (event.target.closest('.row') && !event.target.closest('a') && selectedKey) startClock();
  });
  $('#start').addEventListener('click', startClock);
  $('#stop').addEventListener('click', stopClock);

  for (const button of document.querySelectorAll('.step')) {
    button.addEventListener('click', () => setMinutes(adjustedMinutes + Number(button.dataset.step)));
  }
  for (const id of ['#hours', '#minutes']) {
    $(id).addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/\D/g, '');
    });
    $(id).addEventListener('change', readTimeInputs);
    $(id).addEventListener('focus', (event) => event.target.select());
  }
  $('#reset-time').addEventListener('click', () => setMinutes(measuredMinutes));
  $('#update').addEventListener('click', updateJira);
  $('#resume').addEventListener('click', resumeWork);
  $('#cancel').addEventListener('click', cancelTimer);
  $('#done-ok').addEventListener('click', showPicker);

  $('#settings-back').addEventListener('click', leaveSettings);
  $('#save-settings').addEventListener('click', saveSettings);
  $('#remove-token').addEventListener('click', removeToken);
  $('#toggle-token').addEventListener('click', () => {
    const token = $('#token');
    const reveal = token.type === 'password';
    token.type = reveal ? 'text' : 'password';
    $('#toggle-token').textContent = reveal ? 'Hide' : 'Show';
  });

  if (window.parent !== window) {
    new ResizeObserver(() => {
      window.parent.postMessage({ type: 'jtt:height', height: document.body.offsetHeight }, '*');
    }).observe(document.body);
  }

  notifyHost();
  if (timer.status === 'running') showRunning();
  else if (timer.status === 'stopped') showConfirm();
  else showPicker();
}

init();
