/*
 * Data layer for the popup: extension storage, the encrypted token vault and
 * the Jira REST calls. The UI only uses `Store`, `Auth` and `Api`.
 * (prototype/mock-api.js implements the same interface with sample data.)
 */

const ext = globalThis.browser ?? globalThis.chrome;

const JIRA_BASE_URL = 'https://jira.uhub.biz';
const PROJECT_CACHE_MS = 12 * 60 * 60 * 1000;

const Store = {
  async get(key, fallback) {
    const result = await ext.storage.local.get(key);
    return result[key] ?? fallback;
  },
  async set(key, value) {
    await ext.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await ext.storage.local.remove(key);
  },
};

/* ---------- token vault ----------
 * The token is encrypted with AES-GCM. The key is generated in the browser as
 * a non-extractable CryptoKey and kept in IndexedDB, so script can use it but
 * can never read the key bytes; only the ciphertext lives in extension storage.
 * If IndexedDB is unavailable (some private-browsing setups) the token is
 * stored unencrypted and the Settings screen says so.
 */

const KEY_DB = 'jtt-vault';
const KEY_ID = 'token-key';

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function keyStore(mode) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(KEY_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result.transaction('keys', mode).objectStore('keys'));
  });
}

const settle = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const Vault = {
  async put(token) {
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await settle((await keyStore('readwrite')).put(key, KEY_ID));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
      await Store.set('token', { encrypted: true, iv: toBase64(iv), data: toBase64(data) });
      return true;
    } catch {
      await Store.set('token', { encrypted: false, plain: token });
      return false;
    }
  },

  async get() {
    const record = await Store.get('token', null);
    if (!record) return null;
    if (!record.encrypted) return record.plain;
    try {
      const key = await settle((await keyStore('readonly')).get(KEY_ID));
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(record.iv) },
        key,
        fromBase64(record.data),
      );
      return new TextDecoder().decode(plain);
    } catch {
      return null; // key lost (e.g. site data cleared): the token must be entered again
    }
  },

  async clear() {
    await Store.remove('token');
    try {
      await settle((await keyStore('readwrite')).delete(KEY_ID));
    } catch {
      /* nothing to delete */
    }
  },
};

/* ---------- Jira REST ---------- */

async function jira(path, { method = 'GET', body, token } = {}) {
  const bearer = token ?? (await Vault.get());
  if (!bearer) throw new Error('Add your uHub personal token in Settings.');

  let response;
  try {
    response = await fetch(JIRA_BASE_URL + path, {
      method,
      credentials: 'omit', // never mix the token with the browser's Jira session
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + bearer,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach Jira. Check your connection or VPN and try again.');
  }

  if (response.status === 401) throw new Error('Jira rejected the token. Check it in Settings.');

  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new Error('Jira sent an unexpected response.');
    }
  }
  if (!response.ok) {
    const detail = payload
      ? [...(payload.errorMessages || []), ...Object.values(payload.errors || {})].join(' ')
      : '';
    throw new Error(detail || `Jira returned an error (${response.status}).`);
  }
  return payload;
}

const Auth = {
  /** Must be called straight from a click: Firefox may ask the user to allow the Jira host. */
  requestAccess() {
    return ext.permissions.request({ origins: [JIRA_BASE_URL + '/*'] });
  },

  async status() {
    const record = await Store.get('token', null);
    return { saved: Boolean(record), encrypted: Boolean(record && record.encrypted) };
  },

  /** Checks the token against Jira, then stores it. Rejects if Jira does not accept it. */
  async save(token) {
    const me = await jira('/rest/api/2/myself', { token });
    const encrypted = await Vault.put(token);
    await Store.remove('projects');
    return { displayName: me.displayName || me.name || 'your account', encrypted };
  },

  async clear() {
    await Vault.clear();
    await Store.remove('projects');
  },
};

const Api = {
  issueUrl(issueKey) {
    return `${JIRA_BASE_URL}/browse/${encodeURIComponent(issueKey)}`;
  },

  async getProjects(refresh = false) {
    const cached = await Store.get('projects', null);
    if (!refresh && cached && Date.now() - cached.at < PROJECT_CACHE_MS) return cached.list;
    const list = (await jira('/rest/api/2/project'))
      .map((project) => ({ key: project.key, name: project.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await Store.set('projects', { at: Date.now(), list });
    return list;
  },

  /** Unresolved issues assigned to the current user in one project. */
  async getMyIssues(projectKey) {
    const jql = `project = "${projectKey}" AND assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`;
    const query = new URLSearchParams({ jql, fields: 'summary,status', maxResults: '100' });
    const result = await jira('/rest/api/2/search?' + query);
    return (result.issues || []).map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status ? issue.fields.status.name : '',
    }));
  },

  /** Adds a worklog entry to the issue. Rejects with an Error on failure. */
  async addWorklog(issueKey, seconds, comment, startedAt) {
    const body = {
      timeSpentSeconds: seconds,
      // Jira wants yyyy-MM-dd'T'HH:mm:ss.SSSZ with a numeric offset, not "Z".
      started: new Date(startedAt || Date.now()).toISOString().replace('Z', '+0000'),
    };
    if (comment) body.comment = comment;
    return jira(`/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog`, { method: 'POST', body });
  },
};
