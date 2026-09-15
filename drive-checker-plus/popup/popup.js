const els = {
  signedOutView: document.getElementById("signedOutView"),
  loadingView: document.getElementById("loadingView"),
  errorView: document.getElementById("errorView"),
  errorMessage: document.getElementById("errorMessage"),
  fileList: document.getElementById("fileList"),
  emptyView: document.getElementById("emptyView"),
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  signInBtn: document.getElementById("signInBtn"),
  retryBtn: document.getElementById("retryBtn"),
};

let lastSeenTimestamp = 0;
let searchDebounce = null;

function showOnly(view) {
  const all = [els.signedOutView, els.loadingView, els.errorView, els.fileList, els.emptyView];
  for (const el of all) {
    el.hidden = el !== view;
  }
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response));
  });
}

function relativeTime(isoString) {
  const then = new Date(isoString).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function fallbackIcon(mimeType) {
  if (mimeType?.includes("folder")) return "📁";
  if (mimeType?.includes("spreadsheet")) return "📊";
  if (mimeType?.includes("document")) return "📄";
  if (mimeType?.includes("presentation")) return "📈";
  if (mimeType?.includes("image")) return "🖼️";
  if (mimeType?.includes("pdf")) return "📕";
  return "📄";
}

function renderFiles(files) {
  els.fileList.innerHTML = "";
  if (!files || files.length === 0) {
    showOnly(els.emptyView);
    return;
  }

  for (const file of files) {
    const li = document.createElement("li");
    li.className = "file-item";
    if (new Date(file.modifiedTime).getTime() > lastSeenTimestamp) {
      li.classList.add("unseen");
    }

    if (file.iconLink) {
      const img = document.createElement("img");
      img.className = "file-icon";
      img.src = file.iconLink;
      img.alt = "";
      li.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "file-icon";
      span.textContent = fallbackIcon(file.mimeType);
      li.appendChild(span);
    }

    const meta = document.createElement("div");
    meta.className = "file-meta";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    meta.appendChild(name);

    const sub = document.createElement("div");
    sub.className = "file-sub";
    const owner = file.owners?.[0]?.displayName;
    sub.textContent = owner
      ? `${owner} · ${relativeTime(file.modifiedTime)}`
      : relativeTime(file.modifiedTime);
    meta.appendChild(sub);

    li.appendChild(meta);
    li.addEventListener("click", () => {
      chrome.tabs.create({ url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view` });
    });

    els.fileList.appendChild(li);
  }

  showOnly(els.fileList);
}

async function loadFiles(query) {
  showOnly(els.loadingView);
  const response = await sendMessage({ type: "get-recent-files", query: query || null });

  if (!response) {
    els.errorMessage.textContent = "Could not reach the extension background service.";
    showOnly(els.errorView);
    return;
  }
  if (response.authNeeded) {
    showOnly(els.signedOutView);
    return;
  }
  if (response.error) {
    els.errorMessage.textContent = "Couldn't load your Drive files. Please try again.";
    showOnly(els.errorView);
    return;
  }

  renderFiles(response.files);
  sendMessage({ type: "mark-seen" });
}

async function init() {
  const local = await chrome.storage.local.get("lastSeenTimestamp");
  lastSeenTimestamp = local.lastSeenTimestamp || 0;
  await loadFiles();
}

els.refreshBtn.addEventListener("click", () => loadFiles(els.searchInput.value.trim()));
els.retryBtn.addEventListener("click", () => loadFiles(els.searchInput.value.trim()));
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

els.signInBtn.addEventListener("click", async () => {
  els.signInBtn.disabled = true;
  els.signInBtn.textContent = "Signing in…";
  const result = await sendMessage({ type: "sign-in" });
  els.signInBtn.disabled = false;
  els.signInBtn.textContent = "Sign in to Google Drive";
  if (result?.ok) {
    await loadFiles();
  }
});

els.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    loadFiles(els.searchInput.value.trim());
  }, 350);
});

init();
