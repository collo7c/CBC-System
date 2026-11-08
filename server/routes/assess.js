// Learner side of online assessments. No login: a learner opens the assessment with its access code.
// Correct answers never leave the server. Marking happens here.
const express = require("express");
const crypto = require("crypto");
const db = require("../db/init");

const router = express.Router();

// Marking bands (typical CBC performance bands; adjust here if your school uses different ones)
function levelFor(percent) {
  if (percent >= 75) return "Exceeds";
  if (percent >= 50) return "Meets";
  if (percent >= 25) return "Approaches";
  return "Below";
}

function findOpen(code, res) {
  const a = db.prepare("SELECT * FROM Assessment WHERE AccessCode = ?").get(String(code).trim().toUpperCase());
  if (!a) { res.status(404).json({ error: "That code was not found. Check it and try again." }); return null; }
  if (a.Status !== "open") { res.status(403).json({ error: "This assessment is closed." }); return null; }
  return a;
}

// GET /api/assess/:code — what a learner needs to start (questions WITHOUT answers)
router.get("/:code", (req, res) => {
  const a = findOpen(req.params.code, res);
  if (!a) return;
  const learners = db
    .prepare(
      `SELECT l.LearnerID, l.Name,
              EXISTS (SELECT 1 FROM Assessment_Attempt t
                      WHERE t.AssessmentID = ? AND t.LearnerID = l.LearnerID) AS Done
       FROM Learner l WHERE l.SchoolID = ? AND l.GradeLevel = ? ORDER BY l.Name`
    )
    .all(a.AssessmentID, a.SchoolID, a.GradeLevel);
  const questions = db
    .prepare("SELECT QuestionID, Prompt, OptionA, OptionB, OptionC, OptionD FROM Assessment_Question WHERE AssessmentID = ? ORDER BY QuestionID")
    .all(a.AssessmentID)
    .map((q) => ({
      QuestionID: q.QuestionID,
      Prompt: q.Prompt,
      Options: { A: q.OptionA, B: q.OptionB, C: q.OptionC, D: q.OptionD },
    }));
  res.json({ title: a.Title, gradeLevel: a.GradeLevel, learners, questions });
});

// POST /api/assess/:code/submit — mark it, store the attempt, and create the competency record
router.post("/:code/submit", (req, res) => {
  const a = findOpen(req.params.code, res);
  if (!a) return;
  const learnerId = Number(req.body.learnerId);
  const learner = db
    .prepare("SELECT * FROM Learner WHERE LearnerID = ? AND SchoolID = ? AND GradeLevel = ?")
    .get(learnerId, a.SchoolID, a.GradeLevel);
  if (!learner) return res.status(400).json({ error: "Choose your name from the list." });
  if (db.prepare("SELECT 1 FROM Assessment_Attempt WHERE AssessmentID = ? AND LearnerID = ?").get(a.AssessmentID, learnerId)) {
    return res.status(409).json({ error: "You have already submitted this assessment." });
  }

  const key = db.prepare("SELECT QuestionID, CorrectOption FROM Assessment_Question WHERE AssessmentID = ?").all(a.AssessmentID);
  const given = new Map((Array.isArray(req.body.answers) ? req.body.answers : []).map((x) => [Number(x.questionId), String(x.choice || "").toUpperCase()]));
  const total = key.length;
  const score = key.filter((q) => given.get(q.QuestionID) === q.CorrectOption).length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const level = levelFor(percent);

  db.exec("BEGIN");
  try {
    // The result becomes an ordinary competency record, so reports include it automatically.
    const recordId = Number(
      db
        .prepare(
          `INSERT INTO Competency_Records
             (RubricLevel, ObservationNotes, LearnerID, TeacherID, IndicatorID, SyncStatus, ClientUUID)
           VALUES (?, ?, ?, ?, ?, 'synced', ?)`
        )
        .run(level, `Online assessment "${a.Title}": ${score}/${total} (${percent}%)`, learnerId, a.TeacherID, a.IndicatorID, "online-" + crypto.randomUUID())
        .lastInsertRowid
    );
    db.prepare(
      "INSERT INTO Assessment_Attempt (AssessmentID, LearnerID, Score, Total, RubricLevel, RecordID) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(a.AssessmentID, learnerId, score, total, level, recordId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "You have already submitted this assessment." });
    throw err;
  }
  res.status(201).json({ score, total, percent, level });
});

module.exports = router;
