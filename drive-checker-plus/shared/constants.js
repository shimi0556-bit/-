// Shared constants for Drive Checker Plus (loaded as a classic script in
// both the service worker and the popup/options pages via importScripts /
// <script> tags, so it must not use ES module import/export syntax).

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

const FILE_FIELDS =
  "id,name,mimeType,iconLink,webViewLink,modifiedTime,createdTime,owners(displayName,photoLink),shared,trashed";

const DEFAULT_SETTINGS = {
  pollIntervalMinutes: 5,
  notificationsEnabled: true,
  maxItems: 15,
  onlyNotifyOthers: true,
};

const STORAGE_KEYS = {
  settings: "settings",
  lastSeenTimestamp: "lastSeenTimestamp",
  knownFileState: "knownFileState",
  authNeeded: "authNeeded",
};

const ALARM_NAME = "drive-checker-poll";
