// Screencast Notes - offscreen document
// Runs the actual getUserMedia + MediaRecorder capture, since service
// workers (background.js) have no DOM/media APIs in MV3.

let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;

async function startRecording(streamId) {
  if (mediaRecorder) {
    return { ok: false, error: "already-recording" };
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      },
    });
  } catch (err) {
    // Some sources (e.g. a single tab without shared audio) reject audio;
    // retry video-only so recording still works.
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: streamId,
          },
        },
      });
    } catch (err2) {
      return { ok: false, error: err2.message };
    }
  }

  recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  mediaRecorder = new MediaRecorder(activeStream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.start();
  return { ok: true };
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder) {
      resolve({ ok: false, error: "not-recording" });
      return;
    }

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      recordedChunks = [];
      mediaRecorder = null;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }

      try {
        const dataUrl = await blobToDataUrl(blob);
        resolve({ ok: true, dataUrl });
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    };

    mediaRecorder.stop();
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return;

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId).then(sendResponse);
    return true;
  }
  if (message.type === "STOP_RECORDING") {
    stopRecording().then(sendResponse);
    return true;
  }
  return false;
});
