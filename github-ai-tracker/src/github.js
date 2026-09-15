const API_BASE = 'https://api.github.com';

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'github-ai-tracker',
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function fetchUserEvents(username) {
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}/events?per_page=30`, {
    headers: headers(),
  });
  if (res.status === 404) {
    throw Object.assign(new Error(`GitHub user "${username}" not found`), { status: 404 });
  }
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function describeEvent(evt) {
  const repo = evt.repo && evt.repo.name;
  switch (evt.type) {
    case 'PushEvent': {
      const commits = (evt.payload.commits || []).map((c) => c.message.split('\n')[0]);
      return {
        headline: `pushed ${commits.length} commit(s) to ${repo}`,
        detail: commits.join(' | '),
        url: `https://github.com/${repo}`,
      };
    }
    case 'PullRequestEvent': {
      const pr = evt.payload.pull_request;
      return {
        headline: `${evt.payload.action} a pull request in ${repo}: "${pr.title}"`,
        detail: pr.body ? pr.body.slice(0, 500) : '',
        url: pr.html_url,
      };
    }
    case 'IssuesEvent': {
      const issue = evt.payload.issue;
      return {
        headline: `${evt.payload.action} an issue in ${repo}: "${issue.title}"`,
        detail: issue.body ? issue.body.slice(0, 500) : '',
        url: issue.html_url,
      };
    }
    case 'IssueCommentEvent': {
      return {
        headline: `commented on an issue/PR in ${repo}`,
        detail: (evt.payload.comment.body || '').slice(0, 500),
        url: evt.payload.comment.html_url,
      };
    }
    case 'CreateEvent': {
      return {
        headline: `created ${evt.payload.ref_type} ${evt.payload.ref || ''} in ${repo}`.trim(),
        detail: evt.payload.description || '',
        url: `https://github.com/${repo}`,
      };
    }
    case 'ForkEvent': {
      return {
        headline: `forked ${repo}`,
        detail: '',
        url: evt.payload.forkee ? evt.payload.forkee.html_url : `https://github.com/${repo}`,
      };
    }
    case 'WatchEvent': {
      return {
        headline: `starred ${repo}`,
        detail: '',
        url: `https://github.com/${repo}`,
      };
    }
    case 'ReleaseEvent': {
      const release = evt.payload.release;
      return {
        headline: `${evt.payload.action} release ${release.tag_name} in ${repo}`,
        detail: release.body ? release.body.slice(0, 500) : '',
        url: release.html_url,
      };
    }
    default: {
      return {
        headline: `${evt.type} in ${repo || 'GitHub'}`,
        detail: '',
        url: repo ? `https://github.com/${repo}` : 'https://github.com',
      };
    }
  }
}

module.exports = { fetchUserEvents, describeEvent };
