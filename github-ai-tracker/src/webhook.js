async function notify(entry) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const text = `*${entry.username}* ${entry.headline}${entry.aiInsight ? `\n> ${entry.aiInsight}` : ''}\n${entry.url}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...entry }),
    });
  } catch (err) {
    console.error('Webhook delivery failed:', err.message);
  }
}

module.exports = { notify };
