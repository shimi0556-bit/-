# Drive Checker Plus

A Chrome extension that gives Google Drive the same toolbar-shortcut treatment
as [Checker Plus for Gmail](https://chromewebstore.google.com/detail/checker-plus-for-gmail/bjfggkjmenknynhhaigcgmpjcpekpoaf):
a popup with your most recent files, desktop notifications when something
new shows up or gets edited, and a badge count on the toolbar icon.

## Features

- **Popup file list** — the 10-50 most recently modified files in your
  Drive, with icon, owner, and relative time ("2h ago"), one click opens
  the file in a new tab.
- **Search** — type in the popup to search file names and content without
  leaving the toolbar.
- **New-file notifications** — a background poll (configurable interval)
  diffs the recent-files list and fires a desktop notification when a file
  is added or changed.
- **Badge count** — the toolbar icon shows how many recently-changed files
  you haven't looked at yet; opening the popup clears it.
- **Settings page** — poll interval, notification toggle, and how many
  files to show.

Read-only: the extension only requests the `drive.readonly` OAuth scope, so
it can list and open files but never edit, delete, or share anything.

## Setup

Because this isn't published on the Chrome Web Store, Google requires every
unpacked/OAuth-enabled extension to use its *own* registered OAuth client —
there's no shared client ID that would work for everyone. This is a
one-time, ~5 minute setup:

1. **Load the extension** so Chrome assigns it an ID:
   - Go to `chrome://extensions`, enable **Developer mode**, click
     **Load unpacked**, and select this `drive-checker-plus/` folder.
   - Copy the extension ID shown on its card (or open the extension's
     **Details → Settings** page, which displays it for you).
2. **Create an OAuth client** in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create a project (or reuse one), then enable the **Google Drive API**
     under "APIs & Services → Library".
   - Under "APIs & Services → Credentials", create an
     **OAuth client ID** of type **Chrome Extension**, and paste in the
     extension ID from step 1.
   - If prompted, configure the OAuth consent screen (External/Internal,
     your choice) and add the `drive.readonly` scope.
3. **Wire the client ID into the extension**:
   - Open `manifest.json` and replace `YOUR_OAUTH_CLIENT_ID` in the
     `oauth2.client_id` field with the client ID from step 2.
   - Go back to `chrome://extensions` and click the reload icon on the
     extension's card.
4. Click the toolbar icon and sign in with your Google account.

## How it works

- `background.js` is the MV3 service worker. It uses `chrome.identity` for
  OAuth, polls `GET drive/v3/files` (`orderBy=modifiedTime desc`) on a
  `chrome.alarms` timer, diffs the result against the last-seen state kept
  in `chrome.storage.local`, and raises `chrome.notifications` plus an
  `chrome.action` badge count for anything new or changed.
- `popup/` renders the same recent-files call on demand, plus a debounced
  search box that adds a Drive query (`name contains … or fullText
  contains …`).
- `options/` persists settings to `chrome.storage.sync` and shows the
  one-time OAuth setup instructions (including this install's extension
  ID, for convenience).
- No servers, analytics, or third parties are involved — everything talks
  directly to `www.googleapis.com` using your own OAuth client and your own
  Google account.

## Permissions

| Permission | Why |
|---|---|
| `identity` | Sign-in via `chrome.identity.getAuthToken` |
| `storage` | Cache settings and the last-seen file state |
| `notifications` | Desktop alerts for new/changed files |
| `alarms` | Periodic background polling |
| `https://www.googleapis.com/*` | Calling the Drive API |
