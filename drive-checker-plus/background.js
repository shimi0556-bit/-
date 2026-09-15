importScripts("shared/constants.js");

// ---- Settings ----------------------------------------------------------

async function getSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEYS.settings] || {}) };
}

async function scheduleAlarm() {
  const settings = await getSettings();
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.pollIntervalMinutes,
  });
}

// ---- Auth ---------------------------------------------------------------

function getAuthToken(interactive) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
        return;
      }
      resolve(token);
    });
  });
}

async function clearCachedToken() {
  const token = await getAuthToken(false);
  if (!token) return;
  await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

// ---- Drive API ------------------------------------------------------------

async function fetchRecentFiles(token, { pageSize = 15, query = null } = {}) {
  const params = new URLSearchParams({
    orderBy: "modifiedTime desc",
    pageSize: String(pageSize),
    fields: `files(${FILE_FIELDS})`,
    spaces: "drive",
  });
  const q = ["trashed = false"];
  if (query) {
    const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    q.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
  }
  params.set("q", q.join(" and "));

  const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    await clearCachedToken();
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`);
  }
  const data = await response.json();
  return data.files || [];
}

// ---- Badge / notifications -------------------------------------------------

async function setBadge(count) {
  if (!count || count <= 0) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  await chrome.action.setBadgeText({ text: count > 99 ? "99+" : String(count) });
}

async function notifyNewFiles(files) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled || files.length === 0) return;

  if (files.length === 1) {
    const file = files[0];
    chrome.notifications.create(`drive-file-${file.id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Google Drive",
      message: file.name,
      contextMessage: file.owners?.[0]?.displayName || "",
      priority: 1,
    });
    return;
  }

  chrome.notifications.create("drive-file-batch", {
    type: "list",
    iconUrl: "icons/icon128.png",
    title: `${files.length} new or updated files in Drive`,
    message: files.map((f) => f.name).slice(0, 5).join(", "),
    items: files.slice(0, 5).map((f) => ({ title: f.name, message: "" })),
    priority: 1,
  });
}

// ---- Core polling logic -----------------------------------------------------

async function checkForUpdates({ silent = false } = {}) {
  const token = await getAuthToken(false);
  if (!token) {
    await chrome.storage.local.set({ [STORAGE_KEYS.authNeeded]: true });
    return { authNeeded: true };
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.authNeeded]: false });

  const settings = await getSettings();
  let files;
  try {
    files = await fetchRecentFiles(token, { pageSize: Math.max(settings.maxItems, 25) });
  } catch (err) {
    if (String(err.message) === "unauthorized") {
      await chrome.storage.local.set({ [STORAGE_KEYS.authNeeded]: true });
      return { authNeeded: true };
    }
    console.error("Drive Checker Plus: poll failed", err);
    return { error: true };
  }

  const local = await chrome.storage.local.get([
    STORAGE_KEYS.knownFileState,
    STORAGE_KEYS.lastSeenTimestamp,
  ]);
  const knownState = local[STORAGE_KEYS.knownFileState] || {};
  const lastSeenTimestamp = local[STORAGE_KEYS.lastSeenTimestamp] || 0;
  const isFirstRun = Object.keys(knownState).length === 0;

  const newOrChanged = [];
  const nextState = {};
  for (const file of files) {
    nextState[file.id] = file.modifiedTime;
    const previousModified = knownState[file.id];
    const isNew = !previousModified;
    const isChanged = previousModified && previousModified !== file.modifiedTime;
    if ((isNew || isChanged) && !isFirstRun) {
      newOrChanged.push(file);
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.knownFileState]: nextState });

  const unseenCount = files.filter(
    (f) => new Date(f.modifiedTime).getTime() > lastSeenTimestamp
  ).length;
  await setBadge(unseenCount);

  if (!silent && newOrChanged.length > 0) {
    await notifyNewFiles(newOrChanged);
  }

  return { files, unseenCount };
}

async function markAllSeen() {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastSeenTimestamp]: Date.now() });
  await setBadge(0);
}

// ---- Event wiring -----------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  checkForUpdates({ silent: true });
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  checkForUpdates({ silent: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForUpdates();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
  if (notificationId.startsWith("drive-file-") && notificationId !== "drive-file-batch") {
    const fileId = notificationId.slice("drive-file-".length);
    chrome.tabs.create({ url: `https://drive.google.com/file/d/${fileId}/view` });
    return;
  }
  chrome.tabs.create({ url: "https://drive.google.com/drive/recent" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "get-recent-files": {
        const token = await getAuthToken(false);
        if (!token) {
          sendResponse({ authNeeded: true });
          return;
        }
        const settings = await getSettings();
        try {
          const files = await fetchRecentFiles(token, {
            pageSize: settings.maxItems,
            query: message.query || null,
          });
          sendResponse({ files });
        } catch (err) {
          sendResponse({ error: String(err.message || err) });
        }
        break;
      }
      case "sign-in": {
        const token = await getAuthToken(true);
        sendResponse({ ok: !!token });
        if (token) checkForUpdates({ silent: true });
        break;
      }
      case "sign-out": {
        await clearCachedToken();
        await chrome.storage.local.remove([STORAGE_KEYS.knownFileState, STORAGE_KEYS.lastSeenTimestamp]);
        await setBadge(0);
        sendResponse({ ok: true });
        break;
      }
      case "mark-seen": {
        await markAllSeen();
        sendResponse({ ok: true });
        break;
      }
      case "settings-updated": {
        await scheduleAlarm();
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ error: "unknown message" });
    }
  })();
  return true; // keep the message channel open for the async response
});
