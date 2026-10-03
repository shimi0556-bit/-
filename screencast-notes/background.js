// Screencast Notes - background service worker
// Owns recording lifecycle (via an offscreen document, since MV3 service
// workers have no getUserMedia/MediaRecorder) and screenshots.

const OFFSCREEN_PATH = "offscreen.html";

let recordingState = {
  recording: false,
  startedAt: null,
};

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Recording the screen/tab the user picked into a video file.",
  });
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

function broadcastState() {
  chrome.storage.local.set({ recordingState });
  chrome.runtime.sendMessage({ target: "any", type: "RECORDING_STATE", state: recordingState }).catch(() => {});
}

async function startRecording() {
  if (recordingState.recording) return { ok: false, error: "already-recording" };

  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.desktopCapture.chooseDesktopMedia(
        ["screen", "window", "tab"],
        (id, options) => {
          if (!id) {
            reject(new Error("cancelled"));
            return;
          }
          resolve(id);
        }
      );
    });
  } catch (err) {
    return { ok: false, error: err.message || "cancelled" };
  }

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "START_RECORDING",
    streamId,
  });

  if (response && response.ok) {
    recordingState = { recording: true, startedAt: Date.now() };
    broadcastState();
    return { ok: true };
  }
  await closeOffscreenDocument();
  return { ok: false, error: (response && response.error) || "offscreen-failed" };
}

async function stopRecording() {
  if (!recordingState.recording) return { ok: false, error: "not-recording" };

  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "STOP_RECORDING",
  });

  recordingState = { recording: false, startedAt: null };
  broadcastState();

  if (response && response.ok && response.dataUrl) {
    const filename = `screencast-notes/recording-${timestamp()}.webm`;
    await chrome.downloads.download({ url: response.dataUrl, filename, saveAs: false });
    await closeOffscreenDocument();
    return { ok: true };
  }

  await closeOffscreenDocument();
  return { ok: false, error: (response && response.error) || "no-recording-data" };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function takeScreenshot(tabId, windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const filename = `screencast-notes/screenshot-${timestamp()}.png`;
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || (message.target && message.target !== "background")) return;

  switch (message.type) {
    case "START_RECORDING":
      startRecording().then(sendResponse);
      return true;
    case "STOP_RECORDING":
      stopRecording().then(sendResponse);
      return true;
    case "TAKE_SCREENSHOT": {
      const windowId = sender.tab ? sender.tab.windowId : undefined;
      takeScreenshot(sender.tab ? sender.tab.id : undefined, windowId).then(sendResponse);
      return true;
    }
    case "GET_RECORDING_STATE":
      sendResponse(recordingState);
      return false;
    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ recordingState });
});
