const pollInterval = document.getElementById("pollInterval");
const notificationsEnabled = document.getElementById("notificationsEnabled");
const maxItems = document.getElementById("maxItems");
const saveBtn = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");
const extensionIdEl = document.getElementById("extensionId");

extensionIdEl.textContent = chrome.runtime.id;

async function load() {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.settings);
  const settings = { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEYS.settings] || {}) };
  pollInterval.value = String(settings.pollIntervalMinutes);
  notificationsEnabled.checked = settings.notificationsEnabled;
  maxItems.value = String(settings.maxItems);
}

async function save() {
  const settings = {
    pollIntervalMinutes: Number(pollInterval.value),
    notificationsEnabled: notificationsEnabled.checked,
    maxItems: Number(maxItems.value),
    onlyNotifyOthers: DEFAULT_SETTINGS.onlyNotifyOthers,
  };
  await chrome.storage.sync.set({ [STORAGE_KEYS.settings]: settings });
  chrome.runtime.sendMessage({ type: "settings-updated" });

  savedMsg.hidden = false;
  setTimeout(() => (savedMsg.hidden = true), 1500);
}

saveBtn.addEventListener("click", save);
load();
