/*
 * Background script: mirrors the stored timer on the toolbar icon.
 * Grey = idle, green + elapsed-time badge = clock running, amber = a stopped
 * time is waiting for a decision. The popup owns the timer; this only reads it.
 */

const ext = globalThis.browser ?? globalThis.chrome;

const JIRA_ORIGIN = 'https://jira.uhub.biz';
const ALARM = 'badge-tick';
const BADGE = { running: '#1f8a3b', stopped: '#b25000' };

const iconPaths = (state) => ({
  16: `icons/${state}-16.png`,
  32: `icons/${state}-32.png`,
  48: `icons/${state}-48.png`,
});

function badgeText(timer) {
  if (timer.status === 'stopped') return '!';
  if (timer.status !== 'running') return '';
  const minutes = Math.floor(((timer.accumulatedMs || 0) + Date.now() - timer.startedAt) / 60000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

async function paint() {
  const { timer = { status: 'idle' } } = await ext.storage.local.get('timer');
  const state = ['running', 'stopped'].includes(timer.status) ? timer.status : 'idle';

  await ext.action.setIcon({ path: iconPaths(state) });
  await ext.action.setBadgeText({ text: badgeText(timer) });
  if (state !== 'idle') {
    await ext.action.setBadgeBackgroundColor({ color: BADGE[state] });
    if (ext.action.setBadgeTextColor) await ext.action.setBadgeTextColor({ color: '#ffffff' });
  }
  await ext.action.setTitle({
    title:
      state === 'running'
        ? `Clock running · ${timer.issue.key}`
        : state === 'stopped'
          ? `Time waiting to be logged · ${timer.issue.key}`
          : 'Jira Time Tracker for uHub',
  });

  // The badge shows minutes, so one repaint a minute is enough; alarms survive the worker being suspended.
  if (state === 'running') ext.alarms.create(ALARM, { periodInMinutes: 1 });
  else ext.alarms.clear(ALARM);
}

/*
 * Jira Data Center can refuse POSTs whose Origin is an extension ("XSRF check
 * failed"). Present the extension's own Jira REST calls as same-origin.
 */
async function installOriginRule() {
  try {
    await ext.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Origin', operation: 'set', value: JIRA_ORIGIN }],
          },
          condition: {
            urlFilter: '||jira.uhub.biz/rest/',
            initiatorDomains: [new URL(ext.runtime.getURL('')).hostname],
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    });
  } catch (error) {
    console.warn('Could not install the Jira origin rule', error);
  }
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.timer) paint();
});
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) paint();
});
ext.runtime.onInstalled.addListener(() => {
  installOriginRule();
  paint();
});
ext.runtime.onStartup.addListener(() => {
  installOriginRule();
  paint();
});
