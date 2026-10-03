const recordBtn = document.getElementById("record");
const screenshotBtn = document.getElementById("screenshot");
const statusEl = document.getElementById("status");

function applyState(state) {
  const recording = !!(state && state.recording);
  recordBtn.textContent = recording ? "⏹ עצור הקלטה" : "⏺ הקלט מסך";
  recordBtn.classList.toggle("active", recording);
  statusEl.textContent = recording ? "מקליט כרגע..." : "";
}

chrome.runtime.sendMessage({ target: "background", type: "GET_RECORDING_STATE" }, applyState);

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "RECORDING_STATE") applyState(message.state);
});

recordBtn.addEventListener("click", () => {
  const starting = !recordBtn.classList.contains("active");
  recordBtn.disabled = true;
  const type = starting ? "START_RECORDING" : "STOP_RECORDING";
  chrome.runtime.sendMessage({ target: "background", type }, (res) => {
    recordBtn.disabled = false;
    if (!res || !res.ok) {
      statusEl.textContent = starting ? "לא נבחר מקור הקלטה" : "";
    }
  });
});

screenshotBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "background", type: "TAKE_SCREENSHOT" }, (res) => {
    statusEl.textContent = res && res.ok ? "הצילום נשמר בהורדות" : "שגיאה בצילום";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});
