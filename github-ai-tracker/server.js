const path = require('path');
const express = require('express');
const store = require('./src/store');
const poller = require('./src/poller');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireApiKey(req, res, next) {
  const configured = process.env.API_KEY;
  if (!configured) return next(); // no key set => open (fine for local/dev use)
  const provided = req.get('x-api-key') || req.query.api_key;
  if (provided === configured) return next();
  res.status(401).json({ error: 'invalid or missing API key' });
}

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/watch', (req, res) => {
  res.json({ users: store.listUsers() });
});

app.post('/api/watch', requireApiKey, (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username is required' });
  }
  const user = store.addUser(username.trim());
  res.status(201).json({ user });
});

app.delete('/api/watch/:username', requireApiKey, (req, res) => {
  const removed = store.removeUser(req.params.username);
  if (!removed) return res.status(404).json({ error: 'not tracked' });
  res.json({ ok: true });
});

app.get('/api/activity', (req, res) => {
  const { username, limit } = req.query;
  res.json({
    activity: store.listActivity({ username, limit: limit ? Number(limit) : undefined }),
  });
});

app.post('/api/poll', requireApiKey, async (req, res) => {
  const result = await poller.pollAll();
  res.json(result);
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`github-ai-tracker listening on port ${process.env.PORT || 3000}`);
  poller.start();
});
