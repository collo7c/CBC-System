// Tiny SVG chart helpers. Plain SVG (no library), so the charts work with no internet
// and use the same four CBC rubric colours as the rest of the system.
const CBCCharts = (function () {
  const COLORS = { Exceeds: "#5b4fe0", Meets: "#1f9d6b", Approaches: "#f2a900", Below: "#e4572e" };
  const LEVELS = ["Below", "Approaches", "Meets", "Exceeds"];
  const SCORE = { Below: 1, Approaches: 2, Meets: 3, Exceeds: 4 };

  const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  const short = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
  const empty = (msg) => `<div class="hint">${e(msg)}</div>`;

  // Progress over time: one dot per record, coloured by level, joined by a line.
  function line(points) {
    if (!points.length) return empty("No records yet for this learner.");
    const W = 640, H = 280, L = 92, R = 24, T = 20, B = 46;
    const iw = W - L - R, ih = H - T - B;
    const y = (v) => T + ih - ((v - 1) / 3) * ih;
    const x = (i) => (points.length === 1 ? L + iw / 2 : L + (i / (points.length - 1)) * iw);
    let grid = "";
    LEVELS.forEach((lv) => {
      const yy = y(SCORE[lv]);
      grid += `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>` +
              `<text class="ch-text" x="${L - 10}" y="${yy + 4}" text-anchor="end">${lv}</text>`;
    });
    const path = points.map((p, i) => `${x(i).toFixed(1)},${y(SCORE[p.level]).toFixed(1)}`).join(" ");
    const step = Math.ceil(points.length / 8);
    const dots = points.map((p, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(SCORE[p.level]).toFixed(1)}" r="7" fill="${COLORS[p.level]}" stroke="#fff" stroke-width="2">` +
      `<title>${e(p.date)} — ${e(p.level)}: ${e(p.indicator)}</title></circle>`).join("");
    const labels = points.map((p, i) => (i % step === 0
      ? `<text class="ch-text" x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="middle">${e(String(p.date).slice(5, 10))}</text>` : "")).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Progress over time">${grid}` +
           `${points.length > 1 ? `<polyline class="ch-line" points="${path}"/>` : ""}${dots}${labels}</svg>`;
  }

  // How many results at each level.
  function distribution(counts) {
    const total = LEVELS.reduce((a, l) => a + (counts[l] || 0), 0);
    if (!total) return empty("No records yet for this learner.");
    const W = 640, H = 260, L = 30, T = 30, B = 46, bw = 100;
    const gap = (W - L * 2 - bw * 4) / 3;
    const max = Math.max(1, ...LEVELS.map((l) => counts[l] || 0));
    const ih = H - T - B;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Results by level">` +
      `<line class="ch-grid" x1="${L}" x2="${W - L}" y1="${H - B}" y2="${H - B}"/>` +
      LEVELS.slice().reverse().map((lv, i) => {
        const v = counts[lv] || 0, h = (v / max) * ih, bx = L + i * (bw + gap);
        return `<rect x="${bx}" y="${H - B - h}" width="${bw}" height="${Math.max(h, 2)}" rx="8" fill="${COLORS[lv]}"><title>${lv}: ${v}</title></rect>` +
               `<text class="ch-num" x="${bx + bw / 2}" y="${H - B - h - 8}" text-anchor="middle">${v}</text>` +
               `<text class="ch-text" x="${bx + bw / 2}" y="${H - 18}" text-anchor="middle">${lv}</text>`;
      }).join("") + `</svg>`;
  }

  // Average level (1 to 4) for each strand.
  function strandBars(strands) {
    if (!strands.length) return empty("No records yet for this learner.");
    const rowH = 38, W = 640, L = 210, R = 90, H = 20 + strands.length * rowH + 10;
    const iw = W - L - R;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Average level by strand">` +
      strands.map((s, i) => {
        const yy = 20 + i * rowH, w = (s.average / 4) * iw;
        const lv = LEVELS[Math.min(3, Math.max(0, Math.round(s.average) - 1))];
        return `<text class="ch-text" x="${L - 10}" y="${yy + 17}" text-anchor="end">${e(short(s.strand, 28))}</text>` +
               `<rect x="${L}" y="${yy}" width="${iw}" height="22" rx="11" class="ch-track"/>` +
               `<rect x="${L}" y="${yy}" width="${Math.max(w, 6)}" height="22" rx="11" fill="${COLORS[lv]}"><title>${e(s.strand)}: ${s.average} (${s.count} records)</title></rect>` +
               `<text class="ch-num" x="${L + iw + 10}" y="${yy + 17}">${s.average} (${s.count})</text>`;
      }).join("") + `</svg>`;
  }

  // One stacked bar per grade: how its records split across the four levels.
  function stacked(rows) {
    const withData = rows.filter((r) => LEVELS.some((l) => r.counts[l]));
    if (!withData.length) return empty("No records yet.");
    const rowH = 44, W = 640, L = 90, R = 20, top = 34, H = top + withData.length * rowH + 10;
    const iw = W - L - R;
    const max = Math.max(...withData.map((r) => LEVELS.reduce((a, l) => a + r.counts[l], 0)));
    const legend = LEVELS.slice().reverse().map((lv, i) =>
      `<rect x="${L + i * 120}" y="6" width="14" height="14" rx="4" fill="${COLORS[lv]}"/><text class="ch-text" x="${L + i * 120 + 20}" y="18">${lv}</text>`).join("");
    const bars = withData.map((r, i) => {
      const yy = top + i * rowH;
      let cx = L, segs = "";
      LEVELS.slice().reverse().forEach((lv) => {
        const v = r.counts[lv];
        if (!v) return;
        const w = (v / max) * iw;
        segs += `<rect x="${cx.toFixed(1)}" y="${yy}" width="${w.toFixed(1)}" height="26" fill="${COLORS[lv]}"><title>${e(r.grade)} — ${lv}: ${v}</title></rect>`;
        if (w > 22) segs += `<text class="ch-white" x="${(cx + w / 2).toFixed(1)}" y="${yy + 18}" text-anchor="middle">${v}</text>`;
        cx += w;
      });
      return `<text class="ch-text" x="${L - 10}" y="${yy + 18}" text-anchor="end">${e(r.grade)}</text>${segs}`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Results by grade">${legend}${bars}</svg>`;
  }

  return { COLORS, LEVELS, line, distribution, strandBars, stacked };
})();