const express = require("express");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/records — record competency assessment (use case: Record competency assessment)
// Works the same whether the client is online (immediate) or replaying a queued offline entry.
router.post("/", requireRole("teacher"), (req, res) => {
  const { learnerId, indicatorId, rubricLevel, observationNotes, clientUUID } = req.body;
  if (!learnerId || !indicatorId || !rubricLevel) {
    return res.status(400).json({ error: "learnerId, indicatorId and rubricLevel are required" });
  }

  // Idempotency: replaying the same offline record twice (e.g. retrying a flaky sync)
  // must not create a duplicate row — matches the ClientUUID unique constraint.
  if (clientUUID) {
    const existing = db.prepare("SELECT * FROM Competency_Records WHERE ClientUUID = ?").get(clientUUID);
    if (existing) return res.status(200).json({ ...existing, deduplicated: true });
  }

  const stmt = db.prepare(`
    INSERT INTO Competency_Records
      (RubricLevel, ObservationNotes, LearnerID, TeacherID, IndicatorID, SyncStatus, ClientUUID)
    VALUES (?, ?, ?, ?, ?, 'synced', ?)
  `);
  const info = stmt.run(
    rubricLevel,
    observationNotes || "",
    learnerId,
    req.user.userId,
    indicatorId,
    clientUUID || null
  );
  const record = db.prepare("SELECT * FROM Competency_Records WHERE RecordID = ?").get(info.lastInsertRowid);
  res.status(201).json(record);
});

// GET /api/records — records entered by the logged-in teacher
router.get("/", requireRole("teacher"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT cr.*, l.Name AS LearnerName, ci.Description AS IndicatorDescription
       FROM Competency_Records cr
       JOIN Learner l ON l.LearnerID = cr.LearnerID
       JOIN Competency_Indicator ci ON ci.IndicatorID = cr.IndicatorID
       WHERE cr.TeacherID = ?
       ORDER BY cr.CreatedAt DESC`
    )
    .all(req.user.userId);
  res.json(rows);
});

module.exports = router;
