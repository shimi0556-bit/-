const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are an AI/ML field expert who monitors what notable people are building on GitHub.
Given one GitHub activity event, write a single short insight (max 2 sentences, no preamble) explaining
what it likely means technically and why an AI practitioner would care. If the event is unrelated to
AI/ML, just describe its technical significance plainly. Never invent facts not implied by the event.`;

async function annotate({ username, headline, detail }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const userMessage = `GitHub user: ${username}\nEvent: ${headline}\nDetails: ${detail || '(none)'}`;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error(`Anthropic API error ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();
    return text || null;
  } catch (err) {
    console.error('Anthropic API call failed:', err.message);
    return null;
  }
}

module.exports = { annotate };
