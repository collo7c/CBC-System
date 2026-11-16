// Admin dashboard: school-wide overview by grade (stacked chart) and the learners flagged for support.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  async function load() {
    const chart = $("schoolChart"), sum = $("schoolSummary"), list = $("schoolSupport");
    if (!chart) return;
    try {
      const [ov, support] = await Promise.all([API.get("/analytics/overview"), API.get("/analytics/support")]);
      sum.innerHTML = `
        <div class="stat"><div class="num">${ov.totals.learners}</div><div class="label">Learners</div></div>
        <div class="stat"><div class="num">${ov.totals.records}</div><div class="label">Assessment records</div></div>
        <div class="stat"><div class="num">${ov.totals.needSupport}</div><div class="label">May need support</div></div>`;
      chart.innerHTML = CBCCharts.stacked(ov.grades);
      list.innerHTML = support.length
        ? `<table><thead><tr><th>Learner</th><th>Grade</th><th>Why</th></tr></thead><tbody>${support.map((x) => `
            <tr><td><strong>${esc(x.Name)}</strong></td><td>${esc(x.GradeLevel)}</td>
            <td>${x.reasons.map((r) => `<span class="reason ${x.severity}">${esc(r)}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="success">No learner is flagged right now.</div>`;
    } catch (e) {
      console.error("Could not load overview:", e);
      chart.innerHTML = `<div class="error">${esc(e.message)}</div>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();