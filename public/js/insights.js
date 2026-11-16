// Teacher dashboard: "Learner insights" — who may need support, and one learner's progress charts.
// Needs a connection (it reads the server's analytics); shows a friendly message offline.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  async function loadSupport() {
    const box = $("supportList");
    if (!box) return;
    try {
      const list = await API.get("/analytics/support");
      box.innerHTML = list.length
        ? `<table><thead><tr><th>Learner</th><th>Grade</th><th>Why</th><th>Last results</th><th></th></tr></thead><tbody>${list.map((x) => `
            <tr>
              <td><strong>${esc(x.Name)}</strong></td>
              <td>${esc(x.GradeLevel)}</td>
              <td>${x.reasons.map((r) => `<span class="reason ${x.severity}">${esc(r)}</span>`).join(" ")}</td>
              <td>${x.recent.map((l) => `<span class="dot ${l.toLowerCase()}" title="${esc(l)}"></span>`).join("")}</td>
              <td><button class="secondary" data-view="${x.LearnerID}" style="margin:0;padding:6px 12px;">View chart</button></td>
            </tr>`).join("")}</tbody></table>`
        : `<div class="success">No learner is flagged right now. Everyone looks on track.</div>`;
    } catch (e) {
      console.error("Could not load support list:", e);
      box.innerHTML = `<div class="hint">Insights need a connection (${esc(e.message)}). They load again when you are back online.</div>`;
    }
  }

  async function loadCharts(id) {
    const line = $("chLine"), dist = $("chDist"), strand = $("chStrand"), flags = $("insFlags");
    if (!line || !id) return;
    try {
      const d = await API.get(`/analytics/learner/${id}`);
      line.innerHTML = CBCCharts.line(d.timeline);
      dist.innerHTML = CBCCharts.distribution(d.distribution);
      strand.innerHTML = CBCCharts.strandBars(d.strands);
      flags.innerHTML = d.flags.length
        ? d.flags.map((f) => `<span class="reason high">${esc(f)}</span>`).join(" ")
        : `<span class="reason ok">On track: no warning signs</span>`;
    } catch (e) {
      console.error("Could not load charts:", e);
      const msg = `<div class="hint">Charts need a connection (${esc(e.message)}).</div>`;
      line.innerHTML = msg; dist.innerHTML = ""; strand.innerHTML = ""; flags.innerHTML = "";
    }
  }

  async function loadLearnerList() {
    const sel = $("insLearner");
    if (!sel) return;
    try {
      const learners = await API.get("/learners");
      sel.innerHTML = learners.map((l) => `<option value="${l.LearnerID}">${esc(l.Name)} — ${esc(l.GradeLevel)}</option>`).join("");
      if (sel.value) loadCharts(sel.value);
    } catch (e) { /* offline: stays empty until the connection returns */ }
  }

  function init() {
    const sel = $("insLearner");
    if (!sel) return;
    sel.addEventListener("change", () => loadCharts(sel.value));
    const list = $("supportList");
    list.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-view]");
      if (!b) return;
      sel.value = b.dataset.view;
      loadCharts(sel.value);
      $("insCharts").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    loadLearnerList();
    loadSupport();
    window.addEventListener("online", () => { loadLearnerList(); loadSupport(); });
    // refresh the support list when the teacher syncs or saves new records
    window.addEventListener("cbc:records-changed", () => { loadSupport(); if (sel.value) loadCharts(sel.value); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();