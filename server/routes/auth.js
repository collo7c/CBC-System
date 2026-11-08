const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/init");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/register  (use case: Register and Login)
router.post("/register", (req, res) => {
  // Public self-registration creates TEACHER accounts only.
  // Administrator accounts can only be created by a signed-in administrator
  // (POST /api/admin/administrators), so nobody can escalate their own privileges.
  const { name, email, password, role, schoolId, tscNumber } = req.body;
  if (role && role !== "teacher") {
    return res.status(403).json({
      error: "Administrator accounts can only be created by an existing administrator.",
    });
  }
  if (!name || !email || !password || !schoolId) {
    return res.status(400).json({ error: "name, email, password and schoolId are required" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (!db.prepare("SELECT 1 FROM School WHERE SchoolID = ?").get(schoolId)) {
    return res.status(400).json({ error: "Unknown school" });
  }

  const existing = db.prepare("SELECT UserID FROM User WHERE Email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const userId = db
    .prepare("INSERT INTO User (Name, Email, PasswordHash, Role, SchoolID) VALUES (?, ?, ?, 'teacher', ?)")
    .run(name, email, hash, schoolId).lastInsertRowid;
  db.prepare("INSERT INTO Teacher (UserID, TSCNumber) VALUES (?, ?)").run(userId, tscNumber || null);

  res.status(201).json({ message: "Registered successfully", userId: Number(userId) });
});

// POST /api/auth/login  (use case: Register and Login)
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM User WHERE Email = ?").get(email);
  if (!user || !bcrypt.compareSync(password || "", user.PasswordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign(
    { userId: user.UserID, role: user.Role, schoolId: user.SchoolID, name: user.Name },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: { userId: user.UserID, name: user.Name, role: user.Role, schoolId: user.SchoolID },
  });
});

module.exports = router;
