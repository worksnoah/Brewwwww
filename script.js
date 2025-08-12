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
document.getElementById("sync-btn").addEventListener("click", syncPush); // push

// ==== Local state ====
function saveLocal() { localStorage.setItem("brewGoal", JSON.stringify({ total, history })); }
function loadLocal() {
  const saved = localStorage.getItem("brewGoal");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      total = Number(data.total) || 0;
      history = Array.isArray(data.history) ? data.history.map(n => +n) : [];
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
  saveLocal(); render();
}
function undoLast() {
  if (!history.length) return;
  total = +(total - history.pop()).toFixed(2);
  saveLocal(); render();
}
function resetTracker() {
  if (!confirm("Reset all progress?")) return;
  total = 0; history = [];
  saveLocal(); render();
}

// ==== Confetti ====
function launchConfetti() {
  import("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js")
    .then(({ default: confetti }) => {
      const end = Date.now() + 1500;
      (function frame() {
        confetti({ particleCount: 8, spread: 70, origin: { y: 0.6 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    });
}

// ==== GitHub settings (auto + saved) ====
const GH_INPUTS = {
  user: document.getElementById("github-username"),
  repo: document.getElementById("github-repo"),
  branch: document.getElementById("github-branch"),
  path: document.getElementById("github-filepath"),
  token: document.getElementById("github-token"),
};

function detectFromPages() {
  // Works when hosted at {owner}.github.io/{repo}/...
  try {
    const host = location.host;         // worksnoah.github.io
    const path0 = location.pathname.split("/").filter(Boolean)[0]; // Brewwwww
    if (host.endsWith(".github.io") && path0) {
      const owner = host.replace(".github.io", "");
      return { user: owner, repo: path0, branch: "main", path: "progress.json" };
    }
  } catch {}
  return null;
}

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
["input","change"].forEach(evt =>
  Object.values(GH_INPUTS).forEach(el => el.addEventListener(evt, saveGhSettings))
);

function getGhSettings() {
  return {
    user: GH_INPUTS.user.value.trim(),
    repo: GH_INPUTS.repo.value.trim(),
    branch: (GH_INPUTS.branch.value.trim() || "main"),
    path: (GH_INPUTS.path.value.trim() || "progress.json"),
    token: GH_INPUTS.token.value.trim(),
  };
}

// Apply auto-detected defaults (owner/repo/branch/path) if fields empty
function applyAutoDefaults() {
  const auto = detectFromPages();
  if (!auto) return;
  if (!GH_INPUTS.user.value)   GH_INPUTS.user.value   = auto.user;
  if (!GH_INPUTS.repo.value)   GH_INPUTS.repo.value   = auto.repo;
  if (!GH_INPUTS.branch.value) GH_INPUTS.branch.value = auto.branch;
  if (!GH_INPUTS.path.value)   GH_INPUTS.path.value   = auto.path;
}

// ==== GitHub API helpers ====
function b64enc(s){ return btoa(unescape(encodeURIComponent(s))); }
function b64dec(s){ return decodeURIComponent(escape(atob(s))); }

async function ghGetFile(cfg) {
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const headers = { Accept: "application/vnd.github+json" };
  // Token optional for public GET
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  return res.json(); // { content, sha, ... }
}
async function ghPutFile(cfg, content, sha) {
  if (!cfg.token) throw new Error("Missing token for write");
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`;
  const body = {
    message: `Update Brew goal (${new Date().toISOString()})`,
    content: b64enc(content),
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
  if (!res.ok) throw new Error(`PUT ${res.status}: ${await res.text()}`);
  return res.json();
}

// ==== Sync ====
// Push local state to GitHub (create or update)
async function syncPush() {
  const cfg = getGhSettings();
  if (!cfg.user || !cfg.repo || !cfg.branch || !cfg.path) {
    alert("Missing GitHub settings (owner/repo/branch/path).");
    return;
  }
  try {
    const file = await ghGetFile(cfg);
    const payload = JSON.stringify({ total, history });
    await ghPutFile(cfg, payload, file?.sha);
    alert("Synced to GitHub!");
  } catch (e) {
    console.error(e);
    alert(`Sync failed.\n${e.message}`);
  }
}

// Pull remote state from GitHub and overwrite local (auto on load)
async function syncPull() {
  const cfg = getGhSettings();
  if (!cfg.user || !cfg.repo || !cfg.branch || !cfg.path) return;
  try {
    const file = await ghGetFile(cfg);
    if (!file) return; // nothing remote yet (first push will create)
    const decoded = JSON.parse(b64dec(file.content));
    if (typeof decoded.total === "number" && Array.isArray(decoded.history)) {
      total = +decoded.total;
      history = decoded.history.map(n => +n);
      saveLocal(); render();
    }
  } catch (e) {
    console.warn("Pull failed:", e.message);
  }
}

// ==== Init ====
loadLocal();
loadGhSettings();
applyAutoDefaults();
saveGhSettings();   // persist any auto-detected defaults
render();

// Auto-pull on page load (so other devices show instantly)
syncPull();
