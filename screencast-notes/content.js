// Screencast Notes - content script
// Injects a floating widget (fixed corner) into every page: recording /
// screenshot controls, plus a tabbed notepad whose tabs are saved per page
// (by URL) so returning to the same page brings the same notes back.

(function () {
  if (window.__scnInjected) return;
  window.__scnInjected = true;

  const pageKey = location.origin + location.pathname + location.search;
  const storageKey = `scn_notes::${pageKey}`;
  const COLLAPSE_KEY = "scn_widget_collapsed";

  let state = { tabs: [], activeTabId: null };
  let saveTimer = null;

  function uid() {
    return `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  }

  function defaultState() {
    const id = uid();
    return { tabs: [{ id, title: "הערה 1", content: "" }], activeTabId: id };
  }

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  }

  function saveState(immediate) {
    clearTimeout(saveTimer);
    const doSave = () => {
      chrome.storage.local.set({ [storageKey]: state }, () => {
        const el = root.querySelector(".scn-saved");
        if (el) {
          el.textContent = "נשמר ✓";
          setTimeout(() => {
            if (el.textContent === "נשמר ✓") el.textContent = "";
          }, 1200);
        }
      });
    };
    if (immediate) doSave();
    else saveTimer = setTimeout(doSave, 300);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  // --- Widget DOM -----------------------------------------------------

  const root = document.createElement("div");
  root.id = "scn-widget";
  root.innerHTML = `
    <div class="scn-header">
      <div class="scn-title">
        <span class="scn-rec-dot"></span>
        <span>הערות + הקלטה</span>
      </div>
      <button class="scn-toggle" title="כווץ/הרחב">—</button>
    </div>
    <div class="scn-body">
      <div class="scn-controls">
        <button class="scn-btn scn-record">⏺ הקלט מסך</button>
        <button class="scn-btn scn-shot">📷 צלם מסך</button>
      </div>
      <div class="scn-tabs"></div>
      <textarea class="scn-note" placeholder="כתוב כאן הערה ללשונית הזו..."></textarea>
      <div class="scn-pagehint" title="${escapeHtml(pageKey)}"></div>
      <div class="scn-saved"></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const tabsEl = root.querySelector(".scn-tabs");
  const noteEl = root.querySelector(".scn-note");
  const hintEl = root.querySelector(".scn-pagehint");
  const toggleBtn = root.querySelector(".scn-toggle");
  const recordBtn = root.querySelector(".scn-record");
  const shotBtn = root.querySelector(".scn-shot");

  hintEl.textContent = pageKey.length > 60 ? pageKey.slice(0, 57) + "…" : pageKey;

  function renderTabs() {
    tabsEl.innerHTML = "";
    state.tabs.forEach((tab) => {
      const chip = document.createElement("div");
      chip.className = "scn-tab" + (tab.id === state.activeTabId ? " scn-active-tab" : "");
      chip.title = "לחיצה: מעבר ללשונית. דאבל-קליק: שינוי שם";

      const label = document.createElement("span");
      label.className = "scn-tab-label";
      label.textContent = tab.title;
      chip.appendChild(label);

      if (state.tabs.length > 1) {
        const close = document.createElement("span");
        close.className = "scn-tab-close";
        close.textContent = "✕";
        close.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!confirm(`למחוק את הלשונית "${tab.title}"?`)) return;
          state.tabs = state.tabs.filter((t) => t.id !== tab.id);
          if (state.activeTabId === tab.id) {
            state.activeTabId = state.tabs[0].id;
          }
          renderTabs();
          renderNote();
          saveState(true);
        });
        chip.appendChild(close);
      }

      chip.addEventListener("click", () => {
        state.activeTabId = tab.id;
        renderTabs();
        renderNote();
        saveState(true);
      });

      chip.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const next = prompt("שם חדש ללשונית:", tab.title);
        if (next && next.trim()) {
          tab.title = next.trim();
          renderTabs();
          saveState(true);
        }
      });

      tabsEl.appendChild(chip);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "scn-add-tab";
    addBtn.textContent = "+";
    addBtn.title = "לשונית הערות חדשה";
    addBtn.addEventListener("click", () => {
      const id = uid();
      state.tabs.push({ id, title: `הערה ${state.tabs.length + 1}`, content: "" });
      state.activeTabId = id;
      renderTabs();
      renderNote();
      saveState(true);
    });
    tabsEl.appendChild(addBtn);
  }

  function renderNote() {
    const tab = activeTab();
    noteEl.value = tab ? tab.content : "";
  }

  noteEl.addEventListener("input", () => {
    const tab = activeTab();
    if (!tab) return;
    tab.content = noteEl.value;
    saveState(false);
  });

  // Keep the panel usable while recording: stop clicks/typing from leaking
  // to the underlying page (e.g. hotkeys, drag-to-select).
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("keydown", (e) => e.stopPropagation());

  toggleBtn.addEventListener("click", () => {
    root.classList.toggle("scn-collapsed");
    chrome.storage.local.set({ [COLLAPSE_KEY]: root.classList.contains("scn-collapsed") });
  });

  recordBtn.addEventListener("click", () => {
    if (root.classList.contains("scn-recording")) {
      recordBtn.disabled = true;
      chrome.runtime.sendMessage({ target: "background", type: "STOP_RECORDING" }, () => {
        recordBtn.disabled = false;
      });
    } else {
      recordBtn.disabled = true;
      chrome.runtime.sendMessage({ target: "background", type: "START_RECORDING" }, (res) => {
        recordBtn.disabled = false;
        if (!res || !res.ok) {
          // user likely cancelled the screen picker - nothing to do.
        }
      });
    }
  });

  shotBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ target: "background", type: "TAKE_SCREENSHOT" });
  });

  function applyRecordingState(recState) {
    const recording = !!(recState && recState.recording);
    root.classList.toggle("scn-recording", recording);
    recordBtn.textContent = recording ? "⏹ עצור הקלטה" : "⏺ הקלט מסך";
    recordBtn.classList.toggle("scn-active", recording);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "RECORDING_STATE") {
      applyRecordingState(message.state);
    }
  });

  // --- Load persisted state -------------------------------------------

  chrome.storage.local.get([storageKey, COLLAPSE_KEY], (res) => {
    state = res[storageKey] && res[storageKey].tabs && res[storageKey].tabs.length
      ? res[storageKey]
      : defaultState();
    if (!state.tabs.some((t) => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[0].id;
    }
    renderTabs();
    renderNote();
    if (res[COLLAPSE_KEY]) root.classList.add("scn-collapsed");
  });

  chrome.runtime.sendMessage({ target: "background", type: "GET_RECORDING_STATE" }, (res) => {
    applyRecordingState(res);
  });

  // If notes for this exact page are edited from another tab open on the
  // same URL, keep this panel in sync.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[storageKey] && document.activeElement !== noteEl) {
      const newVal = changes[storageKey].newValue;
      if (newVal && newVal.tabs && newVal.tabs.length) {
        state = newVal;
        if (!state.tabs.some((t) => t.id === state.activeTabId)) {
          state.activeTabId = state.tabs[0].id;
        }
        renderTabs();
        renderNote();
      }
    }
  });
})();
