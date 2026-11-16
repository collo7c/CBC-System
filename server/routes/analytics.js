// Rule-based learner analytics (no machine learning): who may need support, and each learner's progress.
// Every rule is simple and explainable, so a teacher can see exactly why a learner was flagged.
const express = require("express");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("teacher", "administrator"));

const SCORE = { Below: 1, Approaches: 2, Meets: 3, Exceeds: 4 };
const LEVELS = ["Below", "Approaches", "Meets", "Exceeds"];
const STALE_DAYS = 30;

// All records for a school, oldest first, grouped by learner.
function loadSchool(schoolId, onlyLearnerId) {
  const learnerSql = onlyLearnerId
    ? "SELECT LearnerID, Name, GradeLevel FROM Learner WHERE SchoolID = ? AND LearnerID = ?"
    : "SELECT LearnerID, Name, GradeLevel FROM Learner WHERE SchoolID = ? ORDER BY GradeLevel, Name";
  const learners = onlyLearnerId
    ? db.prepare(learnerSql).all(schoolId, onlyLearnerId)
    : db.prepare(learnerSql).all(schoolId);

  const rows = db
    .prepare(
      `SELECT cr.RecordID, cr.LearnerID, cr.RubricLevel, cr.CreatedAt,
              ci.Description AS Indicator, st.Name AS Strand
       FROM Competency_Records cr
       JOIN Learner l ON l.LearnerID = cr.LearnerID
       JOIN Competency_Indicator ci ON ci.IndicatorID = cr.IndicatorID
       JOIN Sub_Strand ss ON ss.SubStrandID = ci.SubStrandID
       JOIN Strand st ON st.StrandID = ss.StrandID
       WHERE l.SchoolID = ?
       ORDER BY cr.CreatedAt, cr.RecordID`
    )
    .all(schoolId);

  const byLearner = new Map(learners.map((l) => [l.LearnerID, { learner: l, recs: [] }]));
  for (const r of rows) if (byLearner.has(r.LearnerID)) byLearner.get(r.LearnerID).recs.push(r);
  return [...byLearner.values()];
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const daysAgo = (sqlDate) => (Date.now() - new Date(sqlDate.replace(" ", "T") + "Z").getTime()) / 86400000;

// The three rules. Returns the reasons a learner is flagged (empty list = on track).
function flagsFor(recs) {
  const reasons = [];
  if (recs.length === 0) return [{ severity: "info", text: "No assessments recorded yet" }];

  const last5 = recs.slice(-5);
  const belowCount = last5.filter((r) => r.RubricLevel === "Below").length;
  if (belowCount >= 2) {
    reasons.push({ severity: "high", text: `${belowCount} "Below" results in the last ${last5.length} records` });
  }

  if (recs.length >= 5) {
    const recent = recs.slice(-3).map((r) => SCORE[r.RubricLevel]);
    const earlier = recs.slice(Math.max(0, recs.length - 6), recs.length - 3).map((r) => SCORE[r.RubricLevel]);
    const drop = avg(earlier) - avg(recent);
    if (drop >= 1) {
      reasons.push({ severity: "high", text: `Declining: recent average ${avg(recent).toFixed(1)} vs ${avg(earlier).toFixed(1)} before` });
    }
  }

  const days = daysAgo(recs[recs.length - 1].CreatedAt);
  if (days > STALE_DAYS) {
    reasons.push({ severity: "info", text: `Not assessed for ${Math.floor(days)} days` });
  }
  return reasons;
}

// GET /api/analytics/support — learners who may need extra support
router.get("/support", (req, res) => {
  const out = [];
  for (const { learner, recs } of loadSchool(req.user.schoolId)) {
    const reasons = flagsFor(recs);
    if (!reasons.length) continue;
    out.push({
      LearnerID: learner.LearnerID,
      Name: learner.Name,
      GradeLevel: learner.GradeLevel,
      severity: reasons.some((r) => r.severity === "high") ? "high" : "info",
      reasons: reasons.map((r) => r.text),
      recent: recs.slice(-5).map((r) => r.RubricLevel),
    });
  }
  out.sort((a, b) => (a.severity === b.severity ? a.Name.localeCompare(b.Name) : a.severity === "high" ? -1 : 1));
  res.json(out);
});

// GET /api/analytics/learner/:id — everything needed to draw one learner's charts
router.get("/learner/:id", (req, res) => {
  const [entry] = loadSchool(req.user.schoolId, Number(req.params.id));
  if (!entry) return res.status(404).json({ error: "Learner not found" });
  const { learner, recs } = entry;

  const distribution = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  const strands = new Map();
  for (const r of recs) {
    distribution[r.RubricLevel]++;
    const s = strands.get(r.Strand) || { strand: r.Strand, total: 0, count: 0 };
    s.total += SCORE[r.RubricLevel];
    s.count++;
    strands.set(r.Strand, s);
  }
  res.json({
    learner,
    timeline: recs.map((r) => ({ date: r.CreatedAt, level: r.RubricLevel, indicator: r.Indicator, strand: r.Strand })),
    distribution,
    strands: [...strands.values()].map((s) => ({ strand: s.strand, average: Math.round((s.total / s.count) * 10) / 10, count: s.count })),
    flags: flagsFor(recs).map((r) => r.text),
  });
});

// GET /api/analytics/overview — school-wide picture by grade
router.get("/overview", (req, res) => {
  const grades = new Map();
  let flagged = 0, learnersTotal = 0, recordsTotal = 0;
  for (const { learner, recs } of loadSchool(req.user.schoolId)) {
    const g = grades.get(learner.GradeLevel) || { grade: learner.GradeLevel, learners: 0, flagged: 0, counts: Object.fromEntries(LEVELS.map((l) => [l, 0])) };
    g.learners++;
    learnersTotal++;
    recordsTotal += recs.length;
    for (const r of recs) g.counts[r.RubricLevel]++;
    if (flagsFor(recs).some((f) => f.severity === "high")) { g.flagged++; flagged++; }
    grades.set(learner.GradeLevel, g);
  }
  res.json({ grades: [...grades.values()], totals: { learners: learnersTotal, records: recordsTotal, needSupport: flagged } });
});

module.exports = router;