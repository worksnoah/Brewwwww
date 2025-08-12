const goal = 500;
let total = 0;
let history = [];

const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const amountInput = document.getElementById("amount");
const historyList = document.getElementById("history");

// Buttons
document.getElementById("add-btn").addEventListener("click", addAmount);
document.querySelectorAll(".quick-btn").forEach(btn => btn.addEventListener("click", () => addAmount(parseFloat(btn.dataset.amount))));
document.getElementById("undo-btn").addEventListener("click", undoLast);
document.getElementById("reset-btn").addEventListener("click", resetTracker);
document.getElementById("sync-btn").addEventListener("click", syncWithGitHub);

// Load from localStorage on start
loadFromLocal();

// Add amount
function addAmount(val) {
    let amount = val || parseFloat(amountInput.value);
    if (!amount || amount <= 0) return;

    total += amount;
    history.push(amount);
    saveLocal();
    render();
    if (total >= goal) launchConfetti();

    amountInput.value = "";
}

// Undo last entry
function undoLast() {
    if (history.length === 0) return;
    total -= history.pop();
    saveLocal();
    render();
}

// Reset
function resetTracker() {
    total = 0;
    history = [];
    saveLocal();
    render();
}

// Render UI
function render() {
    const progress = Math.min((total / goal) * 100, 100);
    progressBar.style.width = progress + "%";
    progressText.textContent = `$${total} / $${goal}`;

    historyList.innerHTML = "";
    let runningTotal = 0;
    history.forEach((amt, idx) => {
        runningTotal += amt;
        const li = document.createElement("li");
        li.textContent = `+${amt} → $${runningTotal}`;
        historyList.appendChild(li);
    });
}

// Save to localStorage
function saveLocal() {
    localStorage.setItem("brewGoal", JSON.stringify({ total, history }));
}

// Load from localStorage
function loadFromLocal() {
    const saved = localStorage.getItem("brewGoal");
    if (saved) {
        const data = JSON.parse(saved);
        total = data.total;
        history = data.history;
        render();
    }
}

// Confetti
function launchConfetti() {
    import('https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js')
        .then(({ default: confetti }) => {
            const duration = 2 * 1000;
            const end = Date.now() + duration;
            (function frame() {
                confetti({ particleCount: 5, spread: 60 });
                if (Date.now() < end) requestAnimationFrame(frame);
            })();
        });
}

// GitHub Sync
async function syncWithGitHub() {
    const username = document.getElementById("github-username").value.trim();
    const repo = document.getElementById("github-repo").value.trim();
    const branch = document.getElementById("github-branch").value.trim();
    const filepath = document.getElementById("github-filepath").value.trim();
    const token = document.getElementById("github-token").value.trim();

    if (!username || !repo || !branch || !filepath || !token) {
        alert("Please fill all GitHub fields.");
        return;
    }

    try {
        // Get existing file to get SHA
        const getRes = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${filepath}?ref=${branch}`, {
            headers: { Authorization: `token ${token}` }
        });
        const fileData = await getRes.json();
        const sha = fileData.sha;

        const newContent = btoa(JSON.stringify({ total, history }, null, 2));

        const putRes = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${filepath}`, {
            method: "PUT",
            headers: { Authorization: `token ${token}` },
            body: JSON.stringify({
                message: "Update progress",
                content: newContent,
                branch,
                sha
            })
        });

        if (putRes.ok) {
            alert("Synced to GitHub!");
        } else {
            alert("Sync failed.");
        }
    } catch (err) {
        console.error(err);
        alert("Error syncing with GitHub.");
    }
}
