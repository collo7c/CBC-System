const user = requireSession("teacher");
localStorage.removeItem("cbc_simulate_offline"); // always start a page load in normal mode
document.getElementById("teacherName").textContent = user ? user.name : "";

let learners = [];
let indicators = [];
let subStrands = [];

// Escapes text before it is placed into HTML, so notes/names can never run as code.
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function init() {
  // allSettled: one failed load (e.g. nothing cached yet) must not stop the rest of the page
  await Promise.allSettled([loadLearners(), loadIndicators(), loadResources()]);
  updateNetBadge();
  updatePendingBadge();
  await loadRecords();
  warmOfflineCache();
}

// While online, make sure the service worker has a saved copy of everything the form needs offline.
function warmOfflineCache() {
  if (!("serviceWorker" in navigator) || !isOnline()) return;
  navigator.serviceWorker.ready.then(() => {
    ["/learners", "/curriculum/indicators", "/curriculum/strands", "/resources", "/records"]
      .forEach((p) => API.get(p).catch(() => {}));
  });
}

async function loadLearners() {
  learners = await API.get("/learners");
  const opts = learners.map((l) => `<option value="${l.LearnerID}">${esc(l.Name)} — ${esc(l.GradeLevel)}</option>`).join("");
  document.getElementById("fLearner").innerHTML = opts;
  document.getElementById("reportLearner").innerHTML = opts;
}

async function loadIndicators() {
  indicators = await API.get("/curriculum/indicators");
  document.getElementById("fIndicator").innerHTML = indicators
    .map((i) => `<option value="${i.IndicatorID}">${esc(i.StrandName)} \u203a ${esc(i.SubStrandName)}: ${esc(i.Description)}</option>`)
    .join("");

  const tree = await API.get("/curriculum/strands");
  subStrands = tree.flatMap((s) => s.subStrands.map((ss) => ({ ...ss, StrandName: s.Name })));
  document.getElementById("resSubStrand").innerHTML = subStrands
    .map((ss) => `<option value="${ss.SubStrandID}">${esc(ss.StrandName)} \u203a ${esc(ss.Name)}</option>`)
    .join("");
}

async function loadRecords() {
  const tbody = document.querySelector("#recordsTable tbody");
  let rows = [];
  try {
    const serverRecords = await API.get("/records");
    rows = serverRecords.map((r) => ({
      learner: r.LearnerName,
      indicator: r.IndicatorDescription,
      rubric: r.RubricLevel,
      notes: r.ObservationNotes,
      status: "synced",
    }));
  } catch (e) { /* offline: server list unavailable, fall through to pending-only view */ }

  const pending = OfflineQueue.all().map((r) => ({
    learner: (learners.find((l) => l.LearnerID === Number(r.learnerId)) || {}).Name || "—",
    indicator: (indicators.find((i) => i.IndicatorID === Number(r.indicatorId)) || {}).Description || "—",
    rubric: r.rubricLevel,
    notes: r.observationNotes,
    status: "pending",
  }));

  rows = [...pending, ...rows];
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${esc(r.learner)}</td><td>${esc(r.indicator)}</td><td>${esc(r.rubric)}</td><td>${esc(r.notes)}</td>
        <td><span class="tag ${r.status}">${r.status}</span></td>
      </tr>`
    )
    .join("") || `<tr><td colspan="5" class="hint">No records yet.</td></tr>`;
}

async function loadResources() {
  const tbody = document.querySelector("#resourceTable tbody");
  try {
    const resources = await API.get("/resources");
    localStorage.setItem("cbc_cached_resources", JSON.stringify(resources));
    render(resources);
  } catch (e) {
    // offline: fall back to the last cached list — use case "Access resource offline"
    const cached = JSON.parse(localStorage.getItem("cbc_cached_resources") || "[]");
    render(cached);
  }
  function render(resources) {
    tbody.innerHTML = resources
      .map((r) => `<tr><td>${esc(r.Title)}</td><td>${esc(r.SubStrandName)}</td><td><a href="${esc(r.FilePath)}" target="_blank">open</a></td></tr>`)
      .join("") || `<tr><td colspan="3" class="hint">No resources yet.</td></tr>`;
  }
}

document.getElementById("recordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const record = {
    learnerId: Number(document.getElementById("fLearner").value),
    indicatorId: Number(document.getElementById("fIndicator").value),
    rubricLevel: document.getElementById("fRubric").value,
    observationNotes: document.getElementById("fNotes").value,
  };
  const successEl = document.getElementById("recordSuccess");

  if (isOnline()) {
    try {
      await API.post("/records", record);
      successEl.textContent = "Saved and synced.";
    } catch (err) {
      // Server unreachable even though navigator says online — queue it anyway.
      OfflineQueue.add(record);
      successEl.textContent = "Server unreachable — saved offline, will sync later.";
    }
  } else {
    OfflineQueue.add(record);
    successEl.textContent = "You're offline — saved locally, will sync automatically later.";
  }

  successEl.classList.remove("hidden");
  e.target.reset();
  updatePendingBadge();
  await loadRecords();
  setTimeout(() => successEl.classList.add("hidden"), 4000);
});

document.getElementById("genReportBtn").addEventListener("click", async () => {
  const learnerId = document.getElementById("reportLearner").value;
  const out = document.getElementById("reportOutput");
  out.innerHTML = "Generating…";
  try {
    const report = await API.post(`/reports/generate/${learnerId}`);
    out.innerHTML = `<div class="success">${esc(report.AttainmentSummary)}</div>`;
  } catch (err) {
    out.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append("title", document.getElementById("resTitle").value);
  fd.append("subStrandId", document.getElementById("resSubStrand").value);
  fd.append("file", document.getElementById("resFile").files[0]);
  try {
    await API.postForm("/resources", fd);
    e.target.reset();
    await loadResources();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  try {
    const result = await syncPendingRecords();
    btn.textContent = result.synced > 0 ? `Synced ${result.synced}` : "Nothing to sync";
  } catch (err) {
    btn.textContent = "Sync failed";
  }
  updatePendingBadge();
  await loadRecords();
  setTimeout(() => { btn.textContent = "Sync now"; btn.disabled = false; }, 2000);
});

// ---------- Demo switch: simulate offline on a single machine ----------
function refreshSimBtn() {
  const sim = localStorage.getItem("cbc_simulate_offline") === "1";
  document.getElementById("simBtn").textContent = sim ? "Go back online" : "Simulate offline";
}
document.getElementById("simBtn").addEventListener("click", () => {
  if (localStorage.getItem("cbc_simulate_offline") === "1") {
    localStorage.removeItem("cbc_simulate_offline");
  } else {
    localStorage.setItem("cbc_simulate_offline", "1");
  }
  refreshSimBtn();
  updateNetBadge();
});
refreshSimBtn();

// ---------- Connectivity ----------
let lastOnline = null;

// Checks real connectivity: the browser's flag AND whether the server answers.
// (DevTools "Offline", a stopped server or lost Wi-Fi all show up within a few seconds.)
async function updateNetBadge() {
  let online = isOnline();
  if (online) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      online = res.ok;
    } catch (e) {
      online = false;
    }
  }
  const badge = document.getElementById("netBadge");
  badge.textContent = online ? "Online" : "Offline";
  badge.className = "badge " + (online ? "online" : "offline");

  // Connected (or just reconnected) and records are waiting: sync them automatically.
  if (online && lastOnline !== true && OfflineQueue.count() > 0) {
    try { await syncPendingRecords(); } catch (e) { /* try again on the next check */ }
    updatePendingBadge();
    loadRecords();
  }
  lastOnline = online;
}

function updatePendingBadge() {
  const badge = document.getElementById("pendingBadge");
  const count = OfflineQueue.count();
  badge.textContent = `${count} pending`;
  badge.classList.toggle("hidden", count === 0);
}

window.addEventListener("online", updateNetBadge);
window.addEventListener("offline", updateNetBadge);
setInterval(updateNetBadge, 3000); // heartbeat: catches cases where the browser event never fires

init();
