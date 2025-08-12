// ==== Config ====
const GOAL = 500;

// ==== State ====
let total = 0;
let history = [];

// ==== Elements ====
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const amountInput = document.getElementById("amount");
const historyList = document.getElementById("history");

document.getElementById("add-btn").addEventListener("click", () => addAmount());
document.querySelectorAll(".quick-btn").forEach(btn =>
  btn.addEventListener("click", () => addAmount(parseFloat(btn.dataset.amount)))
);
document.getElementById("undo-btn").addEventListener("click", undoLast);
document.getElementById("reset-btn").addEventListener("click", resetTracker);
document.getElementById("sync-btn").addEventListener("click", syncPush);

// Optional: add a small “Pull Latest” button under Settings in your HTML if you want.
// For now we’ll also pull automatically on load if settings exist.

// ==== Local Storage ====
function saveLocal() {
  localStorage.setItem("brewGoal", JSON.stringify({ total, history }));
}
function loadLocal() {
  const saved = localStorage.getItem("brewGoal");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      total = Number(data.total) || 0;
      history = Array.isArray(data.history) ? data.history : [];
    } catch {}
  }
}

// ==== Render ====
function render() {
  const pct = Math.min((total / GOAL) * 100, 100);
  progressBar.style.width = pct + "%";
  progressText.textContent = `$${Number(total).toFixed(2)} / $${GOAL}`;

  historyList.innerHTML = "";
  let running = 0;
  history.forEach(amt => {
    running += amt;
    const li = document.createElement("li");
    li.textContent = `+${amt.toFixed(2)} → $${running.toFixed(2)}`;
    historyList.appendChild(li);
  });

  if (total >= GOAL) launchConfetti();
}

// ==== Actions ====
function addAmount(val) {
  const amt = typeof val === "number" ? val : parseFloat(amountInput.value);
  if (!Number.isFinite(amt) || amt <= 0) return;
  total = +(total + amt).toFixed(2);
  history.push(+amt.toFixed(2));
  amountInput.value = "";
  saveLocal();
  render();
}
function undoLast() {
  if (!history.length) return;
  total = +(total - history.pop()).toFixed(2);
  saveLocal();
  render();
}
function resetTracker() {
  if (!confirm("Reset all progress?")) return;
  total = 0;
  history = [];
  saveLocal();
  render();
}

// ==== Confetti (tiny inline) ====
function launchConfetti() {
  import("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js").then(
    ({ default: confetti }) => {
      const end = Date.now() + 1500;
      (function frame() {
        confetti({ particleCount: 8, spread: 70, origin: { y: 0.6 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
  );
}

// ==== GitHub settings persist ====
const GH_INPUTS = {
  user: document.getElementById("github-username"),
  repo: document.getElementById("github-repo"),
  branch: document.getElementById("github-branch"),
  path: document.getElementById("github-filepath"),
  token: document.getElementById("github-token"),
};
function saveGhSettings() {
  const cfg = getGhSettings();
  localStorage.setItem("brewGoal_GH", JSON.stringify(cfg));
}
function loadGhSettings() {
  const raw = localStorage.getItem("brewGoal_GH");
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    GH_INPUTS.user.value = cfg.user || "";
    GH_INPUTS.repo.value = cfg.repo || "";
    GH_INPUTS.branch.value = cfg.branch || "main";
    GH_INPUTS.path.value = cfg.path || "progress.json";
    GH_INPUTS.token.value = cfg.token || "";
  } catch {}
}
["input", "change"].forEach(evt =>
  Object.values(GH_INPUTS).forEach(el => el.addEventListener(evt, saveGhSettings))
);

function getGhSettings() {
  return {
    user: GH_INPUTS.user.value.trim(),
    repo: GH_INPUTS.repo.value.trim(),
    branch: GH_INPUTS.branch.value.trim() || "main",
    path: GH_INPUTS.path.value.trim() || "progress.json",
    token: GH_INPUTS.token.value.trim(),
  };
}

// ==== GitHub API helpers ====
function b64encodeUnicode(str) {
  // handles UTF-8 properly
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}
async function ghGetFile(cfg) {
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(
    cfg.path
  )}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return null; // not found -> first-time create
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GET ${res.status}: ${msg}`);
  }
  return res.json(); // { content, sha, ... }
}
async function ghPutFile(cfg, content, sha) {
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(
    cfg.path
  )}`;
  const body = {
    message: `Update Brew goal (${new Date().toISOString()})`,
    content: b64encodeUnicode(content),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`PUT ${res.status}: ${msg}`);
  }
  return res.json();
}

// ==== Sync logic ====
// Push local state to GitHub (create or update)
async function syncPush() {
  const cfg = getGhSettings();
  if (!cfg.user || !cfg.repo || !cfg.branch || !cfg.path || !cfg.token) {
    alert("Please fill all GitHub fields.");
    return;
  }
  try {
    // Try to read existing file (to obtain sha)
    const file = await ghGetFile(cfg);
    const payload = JSON.stringify({ total, history });
    const sha = file?.sha;
    await ghPutFile(cfg, payload, sha);
    alert("Synced to GitHub!");
  } catch (e) {
    console.error(e);
    alert(`Sync failed.\n${e.message}`);
  }
}

// Pull remote state from GitHub and overwrite local
async function syncPull() {
  const cfg = getGhSettings();
  if (!cfg.user || !cfg.repo || !cfg.branch || !cfg.path || !cfg.token) return;
  try {
    const file = await ghGetFile(cfg);
    if (!file) {
      // If file doesn't exist remotely yet, create it with current local state
      await ghPutFile(cfg, JSON.stringify({ total, history }), undefined);
      return;
    }
    const decoded = JSON.parse(b64decodeUnicode(file.content));
    if (typeof decoded.total === "number" && Array.isArray(decoded.history)) {
      total = +decoded.total;
      history = decoded.history.map(n => +n);
      saveLocal();
      render();
    }
  } catch (e) {
    console.error("Pull failed:", e.message);
    // silent on load; use console for details
  }
}

// ==== Init ====
loadLocal();
loadGhSettings();
render();
// Auto-pull on load (if settings exist) so other devices show instantly
if (GH_INPUTS.user.value && GH_INPUTS.repo.value && GH_INPUTS.token.value) {
  syncPull();
}
