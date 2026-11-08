const express = require("express");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/sync — batch-push records queued while offline.
// Mirrors the corrected sequence diagram:
//   Sync Service -> Local Storage: request flagged records
//   Local Storage --> Sync Service: return flagged records
//   Sync Service -> Central Server: push records
//   Central Server --> Sync Service: acknowledge receipt
//   Sync Service -> Local Storage: update status = synced
// Here "Local Storage" is the browser (localStorage queue) and this endpoint plays
// the role of "Central Server", acknowledging each record it accepts.
router.post("/", requireRole("teacher"), (req, res) => {
  const { records } = req.body; // array of { learnerId, indicatorId, rubricLevel, observationNotes, clientUUID }
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "records must be a non-empty array" });
  }

  const insert = db.prepare(`
    INSERT INTO Competency_Records
      (RubricLevel, ObservationNotes, LearnerID, TeacherID, IndicatorID, SyncStatus, ClientUUID)
    VALUES (?, ?, ?, ?, ?, 'synced', ?)
  `);
  const findByUUID = db.prepare("SELECT * FROM Competency_Records WHERE ClientUUID = ?");

  const acknowledged = [];
  db.exec("BEGIN");
  try {
    for (const r of records) {
      if (r.clientUUID) {
        const existing = findByUUID.get(r.clientUUID);
        if (existing) {
          acknowledged.push({ clientUUID: r.clientUUID, recordId: existing.RecordID, status: "duplicate-skipped" });
          continue;
        }
      }
      const info = insert.run(
        r.rubricLevel,
        r.observationNotes || "",
        r.learnerId,
        req.user.userId,
        r.indicatorId,
        r.clientUUID || null
      );
      acknowledged.push({ clientUUID: r.clientUUID, recordId: Number(info.lastInsertRowid), status: "synced" });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  db.prepare("INSERT INTO Sync_Log (Status, TeacherID, RecordCount) VALUES (?, ?, ?)").run(
    "synced",
    req.user.userId,
    records.length
  );

  res.json({ message: "Sync complete notification", acknowledged });
});

// GET /api/sync/log — sync history for the logged-in teacher
router.get("/log", requireRole("teacher"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM Sync_Log WHERE TeacherID = ? ORDER BY Timestamp DESC")
    .all(req.user.userId);
  res.json(rows);
});

module.exports = router;
