const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_ACTIVITY = 500;

function emptyState() {
  return { users: {}, activity: [] };
}

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { users: parsed.users || {}, activity: parsed.activity || [] };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to read state file, starting fresh:', err.message);
    }
    return emptyState();
  }
}

let state = load();
let saveQueued = false;

function persist() {
  if (saveQueued) return;
  saveQueued = true;
  setImmediate(() => {
    saveQueued = false;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  });
}

function listUsers() {
  return Object.entries(state.users).map(([username, meta]) => ({ username, ...meta }));
}

function addUser(username) {
  const key = username.toLowerCase();
  if (state.users[key]) return state.users[key];
  state.users[key] = { username, addedAt: new Date().toISOString(), lastEventId: null };
  persist();
  return state.users[key];
}

function removeUser(username) {
  const key = username.toLowerCase();
  const existed = Boolean(state.users[key]);
  delete state.users[key];
  if (existed) persist();
  return existed;
}

function setLastEventId(username, eventId) {
  const key = username.toLowerCase();
  if (!state.users[key]) return;
  state.users[key].lastEventId = eventId;
  persist();
}

function addActivity(entry) {
  state.activity.unshift(entry);
  if (state.activity.length > MAX_ACTIVITY) {
    state.activity.length = MAX_ACTIVITY;
  }
  persist();
}

function listActivity({ username, limit = 100 } = {}) {
  const items = username
    ? state.activity.filter((a) => a.username.toLowerCase() === username.toLowerCase())
    : state.activity;
  return items.slice(0, limit);
}

module.exports = {
  listUsers,
  addUser,
  removeUser,
  setLastEventId,
  addActivity,
  listActivity,
};
