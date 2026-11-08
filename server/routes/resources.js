const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/resources — use case: Upload CBC resources
router.post("/", requireRole("teacher"), upload.single("file"), (req, res) => {
  const { title, subStrandId } = req.body;
  if (!req.file || !title || !subStrandId) {
    return res.status(400).json({ error: "file, title and subStrandId are required" });
  }
  const info = db
    .prepare(
      "INSERT INTO Learning_Resource (Title, FilePath, TeacherID, SubStrandID) VALUES (?, ?, ?, ?)"
    )
    .run(title, `/uploads/${req.file.filename}`, req.user.userId, subStrandId);
  const resource = db.prepare("SELECT * FROM Learning_Resource WHERE ResourceID = ?").get(info.lastInsertRowid);
  res.status(201).json(resource);
});

// GET /api/resources — use case: Access resource offline (client caches this list + files)
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT lr.*, ss.Name AS SubStrandName
       FROM Learning_Resource lr
       JOIN Sub_Strand ss ON ss.SubStrandID = lr.SubStrandID
       ORDER BY lr.ResourceID DESC`
    )
    .all();
  res.json(rows);
});

module.exports = router;
