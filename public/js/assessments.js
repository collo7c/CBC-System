 // Teacher dashboard: create and manage online assessments (needs a connection).
// Wrapped so it never clashes with other scripts, and it starts only after the whole page
// (including api.js and teacher.js) has loaded, so the script order in teacher.html can't break it.
(function () {
  // This file needs esc(). It normally comes from teacher.js; define it here if it is missing.
  if (typeof window.esc !== "function") {
    window.esc = function (s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
      ));
    };
  }

  const ASM_GRADES = ["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];
  const $ = (id) => document.getElementById(id);

  function asmFlash(id, text) {
    const el = $(id);
    el.textContent = text;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 6000);
  }

  function asmRenumber() {
    const blocks = document.querySelectorAll("#asmQuestions .q-block");
    blocks.forEach((b, i) => {
      b.querySelector(".q-num").textContent = "Question " + (i + 1);
      b.querySelector(".q-remove").classList.toggle("hidden", blocks.length === 1);
    });
  }

  function asmAddQuestion() {
    const div = document.createElement("div");
    div.className = "q-block";
    div.innerHTML = `
      <div class="q-head"><strong class="q-num"></strong><button type="button" class="danger q-remove" style="margin:0;">Remove</button></div>
      <input type="text" class="q-prompt" placeholder="Type the question" required />
      <div class="q-options">
        ${["A","B","C","D"].map((l) => `<div class="q-opt"><span class="opt-letter">${l}</span><input type="text" class="q-opt-${l}" placeholder="Option ${l}" required /></div>`).join("")}
      </div>
      <label>Correct answer</label>
      <select class="q-correct">${["A","B","C","D"].map((l) => `<option>${l}</option>`).join("")}</select>`;
    div.querySelector(".q-remove").addEventListener("click", () => { div.remove(); asmRenumber(); });
    $("asmQuestions").appendChild(div);
    asmRenumber();
  }

  async function asmLoadIndicators() {
    const sel = $("asmIndicator");
    if (typeof API === "undefined") {
      sel.innerHTML = `<option value="">Scripts loaded in the wrong order: api.js must come before this file</option>`;
      return;
    }
    try {
      const list = await API.get("/curriculum/indicators");
      if (!list.length) {
        sel.innerHTML = `<option value="">No indicators yet - ask the admin to add some</option>`;
        return;
      }
      const keep = sel.value; // don't reset the teacher's choice when this refreshes
      sel.innerHTML = list
        .map((i) => `<option value="${i.IndicatorID}">${esc(i.StrandName)} › ${esc(i.SubStrandName)}: ${esc(i.Description)}</option>`)
        .join("");
      if (keep) sel.value = keep;
    } catch (e) {
      console.error("Could not load indicators:", e);
      sel.innerHTML = `<option value="">Could not load indicators (${esc(e.message)}) - retrying...</option>`;
    }
  }

  async function asmLoadList() {
    const tbody = document.querySelector("#asmTable tbody");
    try {
      const rows = await API.get("/assessments");
      tbody.innerHTML = rows
        .map(
          (a) => `<tr>
            <td>${esc(a.Title)}<div class="hint">${esc(a.Indicator)}</div></td>
            <td>${esc(a.GradeLevel)}</td>
            <td><span class="code-chip">${esc(a.AccessCode)}</span></td>
            <td>${a.Attempts} / ${a.Questions} Qs</td>
            <td><span class="tag ${a.Status === "open" ? "synced" : "pending"}">${a.Status}</span></td>
            <td class="asm-actions">
              <button class="secondary" data-act="results" data-id="${a.AssessmentID}" style="margin:0;">Results</button>
              <button class="secondary" data-act="toggle" data-id="${a.AssessmentID}" data-status="${a.Status}" style="margin:0;">${a.Status === "open" ? "Close" : "Reopen"}</button>
              ${a.Attempts === 0 ? `<button class="danger" data-act="delete" data-id="${a.AssessmentID}" style="margin:0;">Delete</button>` : ""}
            </td>
          </tr>`
        )
        .join("") || `<tr><td colspan="6" class="hint">No online assessments yet.</td></tr>`;
    } catch (e) {
      console.error("Could not load assessments:", e);
      tbody.innerHTML = `<tr><td colspan="6" class="hint">Could not load assessments (${esc(e.message)}). They load again when you are back online.</td></tr>`;
    }
  }

  async function asmShowResults(id) {
    const out = $("asmResults");
    out.innerHTML = "Loading…";
    try {
      const data = await API.get(`/assessments/${id}/results`);
      const rows = data.results;
      out.innerHTML = `<h2 style="margin-top:18px;">Results: ${esc(data.title)}</h2>` + (rows.length
        ? `<table><thead><tr><th>Learner</th><th>Score</th><th>Level</th><th>Submitted</th></tr></thead><tbody>${rows
            .map((r) => `<tr><td>${esc(r.LearnerName)}</td><td>${r.Score} / ${r.Total}</td><td><span class="chip ${r.RubricLevel.toLowerCase()}">${esc(r.RubricLevel)}</span></td><td>${esc(r.SubmittedAt)}</td></tr>`)
            .join("")}</tbody></table><div class="hint">Each result is also saved as a competency record, so it appears in progress reports.</div>`
        : `<div class="hint">No learner has submitted this assessment yet.</div>`);
    } catch (err) {
      out.innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  }

  function asmInit() {
    $("asmGrade").innerHTML = ASM_GRADES.map((g) => `<option>${g}</option>`).join("");
    $("asmLink").textContent = location.origin + "/learner.html";
    asmAddQuestion();
    asmLoadIndicators();
    asmLoadList();

    $("asmAddQ").addEventListener("click", asmAddQuestion);

    $("asmTable").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      try {
        if (btn.dataset.act === "results") return asmShowResults(id);
        if (btn.dataset.act === "toggle") {
          await API.request("PUT", `/assessments/${id}/status`, { status: btn.dataset.status === "open" ? "closed" : "open" });
        } else if (btn.dataset.act === "delete") {
          if (!confirm("Delete this assessment?")) return;
          await API.del(`/assessments/${id}`);
          $("asmResults").innerHTML = "";
        }
        await asmLoadList();
      } catch (err) {
        asmFlash("asmErr", err.message);
      }
    });

    $("asmForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!$("asmIndicator").value) {
        return asmFlash("asmErr", "Choose a competency indicator first. If the list is empty, check your connection or ask the admin to add indicators.");
      }
      const questions = [...document.querySelectorAll("#asmQuestions .q-block")].map((b) => ({
        prompt: b.querySelector(".q-prompt").value,
        options: ["A","B","C","D"].map((l) => b.querySelector(".q-opt-" + l).value),
        correct: b.querySelector(".q-correct").value,
      }));
      try {
        const made = await API.post("/assessments", {
          title: $("asmTitle").value,
          indicatorId: Number($("asmIndicator").value),
          gradeLevel: $("asmGrade").value,
          questions,
        });
        const gradeKept = $("asmGrade").value;
        e.target.reset();
        $("asmGrade").value = gradeKept;
        $("asmQuestions").innerHTML = "";
        asmAddQuestion();
        asmFlash("asmMsg", `Created. Give learners this code: ${made.AccessCode}`);
        await asmLoadList();
      } catch (err) {
        asmFlash("asmErr", err.message);
      }
    });

    window.addEventListener("online", () => { asmLoadIndicators(); asmLoadList(); });
    // self-heal: if the indicator list is still empty, try again every 5 seconds
    setInterval(() => { if (!$("asmIndicator").value) asmLoadIndicators(); }, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", asmInit);
  else asmInit();
})();