const user = requireSession("administrator");
document.getElementById("adminName").textContent = user ? user.name : "";

async function init() {
  await Promise.all([loadOverview(), loadTeachers(), loadAdmins(), loadLearners(), loadReports(), loadCurriculum()]);
}

async function loadOverview() {
  const o = await API.get("/admin/overview");
  const items = [
    ["Teachers", o.teacherCount],
    ["Learners", o.learnerCount],
    ["Competency records", o.recordCount],
    ["Progress reports", o.reportCount],
  ];
  document.getElementById("overviewGrid").innerHTML = items
    .map(([label, num]) => `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`)
    .join("");
}

async function loadTeachers() {
  const teachers = await API.get("/admin/teachers");
  document.querySelector("#teacherTable tbody").innerHTML =
    teachers
      .map(
        (t) => `<tr>
          <td>${t.Name}</td><td>${t.Email}</td><td>${t.TSCNumber || ""}</td>
          <td><button class="danger" style="margin:0;" onclick="removeTeacher(${t.UserID})">Remove</button></td>
        </tr>`
      )
      .join("") || `<tr><td colspan="4" class="hint">No teachers yet.</td></tr>`;
}

async function removeTeacher(id) {
  if (!confirm("Remove this teacher account?")) return;
  await API.del(`/admin/teachers/${id}`);
  await Promise.all([loadTeachers(), loadOverview()]);
}

async function loadReports() {
  const reports = await API.get("/admin/reports");
  document.querySelector("#reportTable tbody").innerHTML =
    reports
      .map(
        (r) => `<tr>
          <td>${r.LearnerName}</td><td>${r.GradeLevel}</td>
          <td>${new Date(r.DateGenerated).toLocaleDateString()}</td><td>${r.AttainmentSummary}</td>
        </tr>`
      )
      .join("") || `<tr><td colspan="4" class="hint">No reports generated yet.</td></tr>`;
}

let strandTree = [];
async function loadCurriculum() {
  strandTree = await API.get("/curriculum/strands");
  document.getElementById("ssStrand").innerHTML = strandTree
    .map((s) => `<option value="${s.StrandID}">${s.Name}</option>`)
    .join("");
  const subStrands = strandTree.flatMap((s) => s.subStrands.map((ss) => ({ ...ss, StrandName: s.Name })));
  document.getElementById("ciSubStrand").innerHTML = subStrands
    .map((ss) => `<option value="${ss.SubStrandID}">${ss.StrandName} \u203a ${ss.Name}</option>`)
    .join("");
}

function flashCurriculumMsg(text) {
  const el = document.getElementById("curriculumMsg");
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

document.getElementById("strandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await API.post("/admin/curriculum/strand", { name: document.getElementById("strandName").value });
  e.target.reset();
  await loadCurriculum();
  flashCurriculumMsg("Strand added.");
});

document.getElementById("subStrandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await API.post("/admin/curriculum/substrand", {
    name: document.getElementById("ssName").value,
    strandId: Number(document.getElementById("ssStrand").value),
  });
  document.getElementById("ssName").value = "";
  await loadCurriculum();
  flashCurriculumMsg("Sub-strand added.");
});

document.getElementById("indicatorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await API.post("/admin/curriculum/indicator", {
    description: document.getElementById("ciDesc").value,
    subStrandId: Number(document.getElementById("ciSubStrand").value),
  });
  document.getElementById("ciDesc").value = "";
  await loadCurriculum();
  flashCurriculumMsg("Indicator added.");
});

// ---------- Learner management ----------
const GRADES = ["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// fill the "Grade / class" dropdown in the add-learner form
document.getElementById("lGrade").innerHTML = GRADES.map((g) => `<option>${g}</option>`).join("");

let learnerList = [];

async function loadLearners() {
  learnerList = await API.get("/admin/learners");
  document.querySelector("#learnerTable tbody").innerHTML =
    learnerList
      .map((l) => `<tr>
        <td>${esc(l.Name)}</td>
        <td>
          <select onchange="changeGrade(${l.LearnerID}, this.value)">
            ${GRADES.map((g) => `<option ${g === l.GradeLevel ? "selected" : ""}>${g}</option>`).join("")}
          </select>
        </td>
        <td><button class="danger" style="margin:0;" onclick="removeLearner(${l.LearnerID})">Remove</button></td>
      </tr>`)
      .join("") || `<tr><td colspan="3" class="hint">No learners yet.</td></tr>`;
}

function flashLearner(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

document.getElementById("learnerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await API.post("/admin/learners", {
      name: document.getElementById("lName").value,
      gradeLevel: document.getElementById("lGrade").value,
    });
    document.getElementById("lName").value = "";
    await Promise.all([loadLearners(), loadOverview()]);
    flashLearner("learnerMsg", "Learner added.");
  } catch (err) {
    flashLearner("learnerErr", err.message);
  }
});

async function changeGrade(id, gradeLevel) {
  try {
    const learner = learnerList.find((l) => l.LearnerID === id);
    await API.request("PUT", `/admin/learners/${id}`, { name: learner.Name, gradeLevel });
    learner.GradeLevel = gradeLevel;
    flashLearner("learnerMsg", "Grade updated.");
  } catch (err) {
    flashLearner("learnerErr", err.message);
    await loadLearners();
  }
}

async function removeLearner(id) {
  if (!confirm("Remove this learner?")) return;
  try {
    await API.del(`/admin/learners/${id}`);
    await Promise.all([loadLearners(), loadOverview()]);
  } catch (err) {
    flashLearner("learnerErr", err.message);
  }
}

// ---------- Administrator accounts ----------
async function loadAdmins() {
  const admins = await API.get("/admin/administrators");
  document.querySelector("#adminTable tbody").innerHTML = admins
    .map((a) => `<tr><td>${esc(a.Name)}</td><td>${esc(a.Email)}</td><td>${esc(a.Department || "—")}</td></tr>`)
    .join("");
}

document.getElementById("adminForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await API.post("/admin/administrators", {
      name: document.getElementById("aName").value,
      email: document.getElementById("aEmail").value,
      password: document.getElementById("aPass").value,
      department: document.getElementById("aDept").value,
    });
    form.reset();
    await loadAdmins();
    flashLearner("adminMsg", "Administrator created.");
  } catch (err) {
    flashLearner("adminErr", err.message);
  }
});

init();
