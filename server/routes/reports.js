const express = require("express");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/reports/generate/:learnerId — use case: Generate progress report
// Summarises the learner's Competency_Records into a Progress_Report row.
router.post("/generate/:learnerId", requireRole("teacher"), (req, res) => {
  const learnerId = req.params.learnerId;
  const learner = db.prepare("SELECT * FROM Learner WHERE LearnerID = ?").get(learnerId);
  if (!learner) return res.status(404).json({ error: "Learner not found" });

  const records = db
    .prepare(
      `SELECT cr.RubricLevel, ci.Description
       FROM Competency_Records cr
       JOIN Competency_Indicator ci ON ci.IndicatorID = cr.IndicatorID
       WHERE cr.LearnerID = ?`
    )
    .all(learnerId);

  if (records.length === 0) {
    return res.status(400).json({ error: "No competency records for this learner yet" });
  }

  const tally = records.reduce((acc, r) => {
    acc[r.RubricLevel] = (acc[r.RubricLevel] || 0) + 1;
    return acc;
  }, {});
  const summaryLines = Object.entries(tally).map(([level, count]) => `${level}: ${count}`);
  const summary = `${learner.Name} (${learner.GradeLevel}) — ${records.length} indicator(s) assessed. ${summaryLines.join(", ")}.`;

  const info = db
    .prepare("INSERT INTO Progress_Report (AttainmentSummary, LearnerID) VALUES (?, ?)")
    .run(summary, learnerId);
  const report = db.prepare("SELECT * FROM Progress_Report WHERE ReportID = ?").get(info.lastInsertRowid);
  res.status(201).json(report);
});

// GET /api/reports/:learnerId — a learner's report history
router.get("/:learnerId", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM Progress_Report WHERE LearnerID = ? ORDER BY DateGenerated DESC")
    .all(req.params.learnerId);
  res.json(rows);
});

module.exports = router;
