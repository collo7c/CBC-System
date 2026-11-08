// Learner page: no login. Open an assessment with its code, answer, and see the result.
// Uses plain fetch (not the API helper) because learners have no token.
let asm = null; // the loaded assessment
let code = "";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
const $ = (id) => document.getElementById(id);
function show(step) {
  ["stepCode", "stepName", "stepQuestions", "stepResult"].forEach((s) => $(s).classList.toggle("hidden", s !== step));
  window.scrollTo(0, 0);
}
function fail(id, msg) { $(id).textContent = msg; $(id).classList.remove("hidden"); }

async function call(method, path, body) {
  let res;
  try {
    res = await fetch("/api/assess" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("You are offline. Connect to the internet and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Something went wrong (${res.status})`);
  return data;
}

$("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("codeErr").classList.add("hidden");
  code = $("codeInput").value.trim().toUpperCase();
  try {
    asm = await call("GET", "/" + encodeURIComponent(code));
    $("asmTitle").textContent = asm.title;
    $("asmMeta").textContent = `${asm.gradeLevel} · ${asm.questions.length} questions`;
    $("nameSelect").innerHTML = asm.learners
      .map((l) => `<option value="${l.LearnerID}" ${l.Done ? "disabled" : ""}>${esc(l.Name)}${l.Done ? " (already submitted)" : ""}</option>`)
      .join("") || `<option value="">No learners found for this grade</option>`;
    show("stepName");
  } catch (err) {
    fail("codeErr", err.message);
  }
});

$("nameForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!$("nameSelect").value) return fail("nameErr", "Choose your name from the list.");
  $("questionList").innerHTML = asm.questions
    .map(
      (q, i) => `<div class="card q-card">
        <div class="q-text"><span class="q-no">${i + 1}</span>${esc(q.Prompt)}</div>
        ${["A", "B", "C", "D"]
          .map(
            (l) => `<label class="opt"><input type="radio" name="q${q.QuestionID}" value="${l}" required />
              <span class="opt-letter">${l}</span><span>${esc(q.Options[l])}</span></label>`
          )
          .join("")}
      </div>`
    )
    .join("");
  show("stepQuestions");
});

$("answerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("submitErr").classList.add("hidden");
  const answers = asm.questions.map((q) => {
    const picked = document.querySelector(`input[name="q${q.QuestionID}"]:checked`);
    return { questionId: q.QuestionID, choice: picked ? picked.value : "" };
  });
  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  try {
    const result = await call("POST", `/${encodeURIComponent(code)}/submit`, {
      learnerId: Number($("nameSelect").value),
      answers,
    });
    const nameOpt = $("nameSelect").selectedOptions[0].textContent.trim();
    $("resName").textContent = nameOpt.split(" ")[0];
    $("resScore").textContent = `${result.score} / ${result.total}`;
    $("resLevel").textContent = result.level;
    $("resLevel").className = "chip " + result.level.toLowerCase();
    $("resMsg").textContent = `${result.percent}% — your teacher can now see this result.`;
    show("stepResult");
  } catch (err) {
    fail("submitErr", err.message);
    btn.disabled = false;
    btn.textContent = "Submit answers";
  }
});

$("doneBtn").addEventListener("click", () => { location.href = "/learner.html"; });
