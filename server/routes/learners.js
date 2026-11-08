const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/learners  — learners in the caller's school
router.get("/", (req, res) => {
  const learners = db
    .prepare("SELECT * FROM Learner WHERE SchoolID = ? ORDER BY Name")
    .all(req.user.schoolId);
  res.json(learners);
});

// GET /api/learners/:id/records — a learner's competency record history
router.get("/:id/records", (req, res) => {
  const rows = db
    .prepare(
      `SELECT cr.*, ci.Description AS IndicatorDescription, u.Name AS TeacherName
       FROM Competency_Records cr
       JOIN Competency_Indicator ci ON ci.IndicatorID = cr.IndicatorID
       JOIN User u ON u.UserID = cr.TeacherID
       WHERE cr.LearnerID = ?
       ORDER BY cr.CreatedAt DESC`
    )
    .all(req.params.id);
  res.json(rows);
});

module.exports = router;
