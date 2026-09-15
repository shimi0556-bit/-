const store = require('./store');
const { fetchUserEvents, describeEvent } = require('./github');
const { annotate } = require('./ai');
const { notify } = require('./webhook');

let running = false;

async function pollUser(user) {
  let events;
  try {
    events = await fetchUserEvents(user.username);
  } catch (err) {
    console.error(`[poll] ${user.username}: ${err.message}`);
    return;
  }

  if (events.length === 0) return;

  // Events arrive newest-first. On the very first poll for a user we only
  // record their most recent event so we don't flood the feed with history.
  let newEvents;
  if (!user.lastEventId) {
    newEvents = events.slice(0, 1);
  } else {
    const idx = events.findIndex((e) => e.id === user.lastEventId);
    newEvents = idx === -1 ? events : events.slice(0, idx);
  }

  store.setLastEventId(user.username, events[0].id);
  if (newEvents.length === 0) return;

  // Oldest-first so the activity feed reads chronologically.
  for (const evt of newEvents.reverse()) {
    const { headline, detail, url } = describeEvent(evt);
    const aiInsight = await annotate({ username: user.username, headline, detail });

    const entry = {
      id: evt.id,
      username: user.username,
      type: evt.type,
      headline,
      url,
      aiInsight,
      createdAt: evt.created_at,
      recordedAt: new Date().toISOString(),
    };

    store.addActivity(entry);
    await notify(entry);
  }
}

async function pollAll() {
  if (running) return { skipped: true };
  running = true;
  try {
    const users = store.listUsers();
    for (const user of users) {
      await pollUser(user);
    }
    return { skipped: false, usersPolled: users.length };
  } finally {
    running = false;
  }
}

function start() {
  const minutes = Number(process.env.POLL_INTERVAL_MINUTES || 10);
  const intervalMs = Math.max(1, minutes) * 60 * 1000;
  pollAll().catch((err) => console.error('Initial poll failed:', err));
  setInterval(() => {
    pollAll().catch((err) => console.error('Poll cycle failed:', err));
  }, intervalMs);
  console.log(`Poller started: every ${minutes} minute(s)`);
}

module.exports = { start, pollAll };
