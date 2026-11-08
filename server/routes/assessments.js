// Teacher side of online assessments: create, list, open/close, view results.
const express = require("express");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("teacher"));

const GRADES = [
  "PP1", "PP2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9",
];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I so codes are easy to read out

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!db.prepare("SELECT 1 FROM Assessment WHERE AccessCode = ?").get(code)) return code;
  }
}

// POST /api/assessments — create an assessment with its questions
router.post("/", (req, res) => {
  const title = (req.body.title || "").trim();
  const { indicatorId, gradeLevel, questions } = req.body;
  if (!title || !indicatorId || !gradeLevel) {
    return res.status(400).json({ error: "title, indicatorId and gradeLevel are required" });
  }
  if (!GRADES.includes(gradeLevel)) return res.status(400).json({ error: "Invalid grade level" });
  if (!db.prepare("SELECT 1 FROM Competency_Indicator WHERE IndicatorID = ?").get(indicatorId)) {
    return res.status(400).json({ error: "Unknown competency indicator" });
  }
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 30) {
    return res.status(400).json({ error: "Add between 1 and 30 questions" });
  }
  for (const [i, q] of questions.entries()) {
    const opts = q.options || [];
    const ok =
      q.prompt && String(q.prompt).trim() &&
      opts.length === 4 && opts.every((o) => o && String(o).trim()) &&
      ["A", "B", "C", "D"].includes(q.correct);
    if (!ok) return res.status(400).json({ error: `Question ${i + 1} needs a prompt, four options and a correct answer` });
  }

  const code = newCode();
  db.exec("BEGIN");
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO Assessment (Title, AccessCode, GradeLevel, IndicatorID, TeacherID, SchoolID)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(title, code, gradeLevel, indicatorId, req.user.userId, req.user.schoolId).lastInsertRowid
    );
    const ins = db.prepare(
      `INSERT INTO Assessment_Question (AssessmentID, Prompt, OptionA, OptionB, OptionC, OptionD, CorrectOption)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const q of questions) {
      ins.run(id, String(q.prompt).trim(), ...q.options.map((o) => String(o).trim()), q.correct);
    }
    db.exec("COMMIT");
    res.status(201).json({ AssessmentID: id, AccessCode: code });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

// GET /api/assessments — this teacher's assessments
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.AssessmentID, a.Title, a.AccessCode, a.GradeLevel, a.Status, a.CreatedAt,
              ci.Description AS Indicator,
              (SELECT COUNT(*) FROM Assessment_Question q WHERE q.AssessmentID = a.AssessmentID) AS Questions,
              (SELECT COUNT(*) FROM Assessment_Attempt t WHERE t.AssessmentID = a.AssessmentID) AS Attempts
       FROM Assessment a
       JOIN Competency_Indicator ci ON ci.IndicatorID = a.IndicatorID
       WHERE a.TeacherID = ?
       ORDER BY a.AssessmentID DESC`
    )
    .all(req.user.userId);
  res.json(rows);
});

function ownAssessment(req, res) {
  const a = db
    .prepare("SELECT * FROM Assessment WHERE AssessmentID = ? AND TeacherID = ?")
    .get(req.params.id, req.user.userId);
  if (!a) res.status(404).json({ error: "Assessment not found" });
  return a;
}

// GET /api/assessments/:id/results — who has answered and how they did
router.get("/:id/results", (req, res) => {
  const a = ownAssessment(req, res);
  if (!a) return;
  const rows = db
    .prepare(
      `SELECT l.Name AS LearnerName, t.Score, t.Total, t.RubricLevel, t.SubmittedAt
       FROM Assessment_Attempt t JOIN Learner l ON l.LearnerID = t.LearnerID
       WHERE t.AssessmentID = ? ORDER BY l.Name`
    )
    .all(a.AssessmentID);
  res.json({ title: a.Title, results: rows });
});

// PUT /api/assessments/:id/status — open or close it for learners
router.put("/:id/status", (req, res) => {
  const a = ownAssessment(req, res);
  if (!a) return;
  const status = req.body.status;
  if (!["open", "closed"].includes(status)) return res.status(400).json({ error: "status must be open or closed" });
  db.prepare("UPDATE Assessment SET Status = ? WHERE AssessmentID = ?").run(status, a.AssessmentID);
  res.json({ message: "Updated", status });
});

// DELETE /api/assessments/:id — only while nobody has answered it
router.delete("/:id", (req, res) => {
  const a = ownAssessment(req, res);
  if (!a) return;
  if (db.prepare("SELECT 1 FROM Assessment_Attempt WHERE AssessmentID = ? LIMIT 1").get(a.AssessmentID)) {
    return res.status(409).json({ error: "Learners have already answered this assessment, so it can only be closed." });
  }
  db.prepare("DELETE FROM Assessment WHERE AssessmentID = ?").run(a.AssessmentID);
  res.json({ message: "Deleted" });
});

module.exports = router;
