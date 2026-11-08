const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("administrator"));

// GET /api/admin/teachers — use case: Manage teacher accounts
router.get("/teachers", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.UserID, u.Name, u.Email, t.TSCNumber
       FROM User u JOIN Teacher t ON t.UserID = u.UserID
       WHERE u.SchoolID = ?
       ORDER BY u.Name`
    )
    .all(req.user.schoolId);
  res.json(rows);
});

// DELETE /api/admin/teachers/:id — use case: Manage teacher accounts
router.delete("/teachers/:id", (req, res) => {
  db.prepare("DELETE FROM User WHERE UserID = ? AND SchoolID = ? AND Role = 'teacher'").run(
    req.params.id,
    req.user.schoolId
  );
  res.json({ message: "Teacher account removed" });
});

// GET /api/admin/reports — use case: View school reports
router.get("/reports", (req, res) => {
  const rows = db
    .prepare(
      `SELECT pr.*, l.Name AS LearnerName, l.GradeLevel
       FROM Progress_Report pr
       JOIN Learner l ON l.LearnerID = pr.LearnerID
       WHERE l.SchoolID = ?
       ORDER BY pr.DateGenerated DESC`
    )
    .all(req.user.schoolId);
  res.json(rows);
});

// GET /api/admin/overview — dashboard counts
router.get("/overview", (req, res) => {
  const schoolId = req.user.schoolId;
  const teacherCount = db
    .prepare("SELECT COUNT(*) c FROM User WHERE Role='teacher' AND SchoolID=?")
    .get(schoolId).c;
  const learnerCount = db.prepare("SELECT COUNT(*) c FROM Learner WHERE SchoolID=?").get(schoolId).c;
  const recordCount = db
    .prepare(
      `SELECT COUNT(*) c FROM Competency_Records cr
       JOIN Learner l ON l.LearnerID = cr.LearnerID WHERE l.SchoolID=?`
    )
    .get(schoolId).c;
  const reportCount = db
    .prepare(
      `SELECT COUNT(*) c FROM Progress_Report pr
       JOIN Learner l ON l.LearnerID = pr.LearnerID WHERE l.SchoolID=?`
    )
    .get(schoolId).c;

  res.json({ teacherCount, learnerCount, recordCount, reportCount });
});

// POST /api/admin/curriculum/strand — use case: Configure curriculum parameters
router.post("/curriculum/strand", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const info = db.prepare("INSERT INTO Strand (Name) VALUES (?)").run(name);
  res.status(201).json({ StrandID: info.lastInsertRowid, Name: name });
});

// POST /api/admin/curriculum/substrand — use case: Configure curriculum parameters
router.post("/curriculum/substrand", (req, res) => {
  const { name, strandId } = req.body;
  if (!name || !strandId) return res.status(400).json({ error: "name and strandId are required" });
  const info = db.prepare("INSERT INTO Sub_Strand (Name, StrandID) VALUES (?, ?)").run(name, strandId);
  res.status(201).json({ SubStrandID: info.lastInsertRowid, Name: name, StrandID: strandId });
});

// POST /api/admin/curriculum/indicator — use case: Configure curriculum parameters
router.post("/curriculum/indicator", (req, res) => {
  const { description, subStrandId } = req.body;
  if (!description || !subStrandId) {
    return res.status(400).json({ error: "description and subStrandId are required" });
  }
  const info = db
    .prepare("INSERT INTO Competency_Indicator (Description, SubStrandID) VALUES (?, ?)")
    .run(description, subStrandId);
  res.status(201).json({ IndicatorID: info.lastInsertRowid, Description: description, SubStrandID: subStrandId });
});

// ---------- Learner management (use case: Manage learners) ----------

const VALID_GRADES = [
  "PP1", "PP2",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9",
];

// GET /api/admin/learners — list learners in the admin's school
router.get("/learners", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM Learner WHERE SchoolID = ? ORDER BY GradeLevel, Name")
    .all(req.user.schoolId);
  res.json(rows);
});

// POST /api/admin/learners — create a learner
router.post("/learners", (req, res) => {
  const name = (req.body.name || "").trim();
  const gradeLevel = req.body.gradeLevel;
  if (!name || !gradeLevel) {
    return res.status(400).json({ error: "name and gradeLevel are required" });
  }
  if (!VALID_GRADES.includes(gradeLevel)) {
    return res.status(400).json({ error: "Invalid grade level" });
  }
  const info = db
    .prepare("INSERT INTO Learner (Name, GradeLevel, SchoolID) VALUES (?, ?, ?)")
    .run(name, gradeLevel, req.user.schoolId);
  res.status(201).json({
    LearnerID: Number(info.lastInsertRowid),
    Name: name,
    GradeLevel: gradeLevel,
    SchoolID: req.user.schoolId,
  });
});

// PUT /api/admin/learners/:id — edit name / change grade (e.g. promote to next grade)
router.put("/learners/:id", (req, res) => {
  const name = (req.body.name || "").trim();
  const gradeLevel = req.body.gradeLevel;
  if (!name || !gradeLevel) {
    return res.status(400).json({ error: "name and gradeLevel are required" });
  }
  if (!VALID_GRADES.includes(gradeLevel)) {
    return res.status(400).json({ error: "Invalid grade level" });
  }
  const info = db
    .prepare("UPDATE Learner SET Name = ?, GradeLevel = ? WHERE LearnerID = ? AND SchoolID = ?")
    .run(name, gradeLevel, req.params.id, req.user.schoolId);
  if (info.changes === 0) return res.status(404).json({ error: "Learner not found" });
  res.json({ message: "Learner updated" });
});

// DELETE /api/admin/learners/:id — only if the learner has no assessment history
router.delete("/learners/:id", (req, res) => {
  const learner = db
    .prepare("SELECT LearnerID FROM Learner WHERE LearnerID = ? AND SchoolID = ?")
    .get(req.params.id, req.user.schoolId);
  if (!learner) return res.status(404).json({ error: "Learner not found" });

  const hasRecords = db
    .prepare("SELECT 1 FROM Competency_Records WHERE LearnerID = ? LIMIT 1")
    .get(req.params.id);
  const hasReports = db
    .prepare("SELECT 1 FROM Progress_Report WHERE LearnerID = ? LIMIT 1")
    .get(req.params.id);
  if (hasRecords || hasReports) {
    return res.status(409).json({
      error: "This learner has assessment records or reports and cannot be deleted. Edit the learner instead.",
    });
  }

  db.prepare("DELETE FROM Learner WHERE LearnerID = ?").run(req.params.id);
  res.json({ message: "Learner removed" });
});

// ---------- Administrator accounts (only an existing admin can create another) ----------

// GET /api/admin/administrators — who has admin access to this school
router.get("/administrators", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.UserID, u.Name, u.Email, a.Department
       FROM User u JOIN Administrator a ON a.UserID = u.UserID
       WHERE u.SchoolID = ? ORDER BY u.Name`
    )
    .all(req.user.schoolId);
  res.json(rows);
});

// POST /api/admin/administrators — create another administrator for the SAME school
router.post("/administrators", (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const { password, department } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (db.prepare("SELECT 1 FROM User WHERE Email = ?").get(email)) {
    return res.status(409).json({ error: "Email already registered" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const userId = db
    .prepare("INSERT INTO User (Name, Email, PasswordHash, Role, SchoolID) VALUES (?, ?, ?, 'administrator', ?)")
    .run(name, email, hash, req.user.schoolId).lastInsertRowid;
  db.prepare("INSERT INTO Administrator (UserID, Department) VALUES (?, ?)").run(userId, department || null);
  res.status(201).json({ message: "Administrator created", userId: Number(userId) });
});

module.exports = router;
