// ===== Config =====
const GOAL = 500;

// ===== State =====
let total = 0;
let history = [];

// ===== Elements =====
const progressBar  = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const amountInput  = document.getElementById("amount");
const historyList  = document.getElementById("history");

document.getElementById("add-btn").addEventListener("click", () => addAmount());
document.querySelectorAll(".quick-btn").forEach(btn =>
  btn.addEventListener("click", () => addAmount(parseFloat(btn.dataset.amount)))
);
document.getElementById("undo-btn").addEventListener("click", undoLast);
document.getElementById("reset-btn").addEventListener("click", resetTracker);
document.getElementById("sync-btn").addEventListener("click", syncPush);
document.getElementById("pull-btn").addEventListener("click", syncPull);
document.getElementById("save-settings-repo-btn").addEventListener("click", saveSettingsToRepo);

// ===== Local state =====
function saveLocal(){ localStorage.setItem("brewGoal", JSON.stringify({ total, history })); }
function loadLocal(){
  const raw = localStorage.getItem("brewGoal");
  if(!raw) return;
  try{
    const d = JSON.parse(raw);
    total = Number(d.total)||0;
    history = Array.isArray(d.history) ? d.history.map(n=>+n) : [];
  }catch{}
}

// ===== Render =====
function render(){
  const pct = Math.min((total/GOAL)*100, 100);
  progressBar.style.width = pct + "%";
  progressText.textContent = `$${Number(total).toFixed(2)} / $${GOAL}`;

  historyList.innerHTML = "";
  let run = 0;
  history.forEach(amt=>{
    run += amt;
    const li = document.createElement("li");
    li.innerHTML = `<span>+${amt.toFixed(2)}</span><span>$${run.toFixed(2)}</span>`;
    historyList.appendChild(li);
  });

  if(total >= GOAL) launchConfetti();
}

// ===== Actions =====
function addAmount(val){
  const amt = typeof val === "number" ? val : parseFloat(amountInput.value);
  if(!Number.isFinite(amt) || amt<=0) return;
  total = +(total + amt).toFixed(2);
  history.push(+amt.toFixed(2));
  amountInput.value = "";
  saveLocal(); render();
}
function undoLast(){
  if(!history.length) return;
  total = +(total - history.pop()).toFixed(2);
  saveLocal(); render();
}
function resetTracker(){
  if(!confirm("Reset all progress?")) return;
  total = 0; history = [];
  saveLocal(); render();
}

// ===== Confetti =====
function launchConfetti(){
  import("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js")
    .then(({default:confetti})=>{
      const end = Date.now()+1600;
      (function frame(){
        confetti({particleCount:8, spread:70, origin:{y:.6}});
        if(Date.now()<end) requestAnimationFrame(frame);
      })();
    });
}

// ===== GitHub settings (auto + saved + repo-synced) =====
const GH_INPUTS = {
  user: document.getElementById("github-username"),
  repo: document.getElementById("github-repo"),
  branch: document.getElementById("github-branch"),
  path: document.getElementById("github-filepath"),
  settingsPath: document.getElementById("github-settingspath"),
  token: document.getElementById("github-token"),
};

function detectFromPages(){
  // If hosted at {owner}.github.io/{repo}/...
  try{
    const host = location.host;                 // worksnoah.github.io
    const first = location.pathname.split("/").filter(Boolean)[0]; // Brewwwww
    if(host.endsWith(".github.io") && first){
      const owner = host.replace(".github.io","");
      return { user: owner, repo: first, branch: "main", path: "progress.json", settingsPath: "tracker-settings.json" };
    }
  }catch{}
  return null;
}

function saveGhSettings(){ localStorage.setItem("brewGoal_GH", JSON.stringify(getGhSettings())); }
function loadGhSettings(){
  const raw = localStorage.getItem("brewGoal_GH");
  if(!raw) return;
  try{
    const c = JSON.parse(raw);
    GH_INPUTS.user.value         = c.user || "";
    GH_INPUTS.repo.value         = c.repo || "";
    GH_INPUTS.branch.value       = c.branch || "main";
    GH_INPUTS.path.value         = c.path || "progress.json";
    GH_INPUTS.settingsPath.value = c.settingsPath || "tracker-settings.json";
    GH_INPUTS.token.value        = c.token || "";
  }catch{}
}
["input","change"].forEach(evt =>
  Object.values(GH_INPUTS).forEach(el => el.addEventListener(evt, saveGhSettings))
);

function getGhSettings(){
  return {
    user: GH_INPUTS.user.value.trim(),
    repo: GH_INPUTS.repo.value.trim(),
    branch: (GH_INPUTS.branch.value.trim() || "main"),
    path: (GH_INPUTS.path.value.trim() || "progress.json"),
    settingsPath: (GH_INPUTS.settingsPath.value.trim() || "tracker-settings.json"),
    token: GH_INPUTS.token.value.trim(),
  };
}

function applyAutoDefaults(){
  const auto = detectFromPages();
  if(!auto) return;
  if(!GH_INPUTS.user.value)         GH_INPUTS.user.value = auto.user;
  if(!GH_INPUTS.repo.value)         GH_INPUTS.repo.value = auto.repo;
  if(!GH_INPUTS.branch.value)       GH_INPUTS.branch.value = auto.branch;
  if(!GH_INPUTS.path.value)         GH_INPUTS.path.value = auto.path;
  if(!GH_INPUTS.settingsPath.value) GH_INPUTS.settingsPath.value = auto.settingsPath;
}

// ===== GitHub API helpers =====
const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(s)));

async function ghGetFile(cfg, pathOverride){
  const path = pathOverride || cfg.path;
  if(!cfg.user || !cfg.repo || !cfg.branch || !path) return null;
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const headers = { Accept: "application/vnd.github+json" };
  if(cfg.token) headers.Authorization = `Bearer ${cfg.token}`; // token optional for public GET
  const res = await fetch(url, { headers });
  if(res.status === 404) return null;
  if(!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  return res.json(); // {content, sha, ...}
}
async function ghPutFile(cfg, content, sha, pathOverride){
  const path = pathOverride || cfg.path;
  if(!cfg.token) throw new Error("Missing token for write");
  const url = `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `Update Brew tracker (${new Date().toISOString()})`,
    content: b64enc(content),
    branch: cfg.branch,
  };
  if(sha) body.sha = sha;
  const res = await fetch(url, {
    method:"PUT",
    headers:{
      Authorization:`Bearer ${cfg.token}`,
      Accept:"application/vnd.github+json",
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`PUT ${res.status}: ${await res.text()}`);
  return res.json();
}

// ===== Sync: progress =====
async function syncPush(){
  const cfg = getGhSettings();
  if(!cfg.user || !cfg.repo || !cfg.branch || !cfg.path){
    alert("Missing GitHub settings (owner/repo/branch/path).");
    return;
  }
  try{
    const file = await ghGetFile(cfg); // may be null on first push
    const payload = JSON.stringify({ total, history });
    await ghPutFile(cfg, payload, file?.sha);
    alert("Synced to GitHub!");
  }catch(e){
    console.error(e);
    alert(`Sync failed.\n${e.message}`);
  }
}
async function syncPull(){
  const cfg = getGhSettings();
  if(!cfg.user || !cfg.repo || !cfg.branch || !cfg.path) return;
  try{
    const file = await ghGetFile(cfg);
    if(!file) return; // nothing remote yet
    const decoded = JSON.parse(b64dec(file.content));
    if(typeof decoded.total === "number" && Array.isArray(decoded.history)){
      total = +decoded.total;
      history = decoded.history.map(n=>+n);
      saveLocal(); render();
    }
  }catch(e){
    console.warn("Pull failed:", e.message);
  }
}

// ===== Sync: settings (repo-level, no token saved) =====
// Saves owner/repo/branch/progress path/goal to `settingsPath` in the repo.
// Any device can pull this file (if repo is public) to auto-fill settings.
async function saveSettingsToRepo(){
  const cfg = getGhSettings();
  if(!cfg.user || !cfg.repo || !cfg.branch || !cfg.settingsPath){
    alert("Fill owner/repo/branch and settings path.");
    return;
  }
  try{
    const existing = await ghGetFile(cfg, cfg.settingsPath);
    const toWrite = {
      user: cfg.user,
      repo: cfg.repo,
      branch: cfg.branch,
      path: cfg.path,
      settingsPath: cfg.settingsPath,
      goal: GOAL
      // NOTE: no token saved here by design
    };
    await ghPutFile(cfg, JSON.stringify(toWrite, null, 2), existing?.sha, cfg.settingsPath);
    alert("Settings saved to repo!");
  }catch(e){
    console.error(e);
    alert(`Couldn’t save settings.\n${e.message}`);
  }
}

async function pullSettingsFromRepo(){
  // Try to fetch settings JSON and auto-fill, even without a token (public repo)
  const cfg = getGhSettings();
  if(!cfg.user || !cfg.repo || !cfg.branch || !cfg.settingsPath) return;
  try{
    const file = await ghGetFile(cfg, cfg.settingsPath);
    if(!file) return;
    const s = JSON.parse(b64dec(file.content));
    if(s.user)   GH_INPUTS.user.value   = s.user;
    if(s.repo)   GH_INPUTS.repo.value   = s.repo;
    if(s.branch) GH_INPUTS.branch.value = s.branch;
    if(s.path)   GH_INPUTS.path.value   = s.path;
    if(s.settingsPath) GH_INPUTS.settingsPath.value = s.settingsPath;
    saveGhSettings();
  }catch(e){
    // silent
  }
}

// ===== Init =====
loadLocal();
loadGhSettings();
applyAutoDefaults();
saveGhSettings();        // persist any auto defaults
await pullSettingsFromRepo(); // fill from repo if available
render();
syncPull();              // auto-pull progress on load
