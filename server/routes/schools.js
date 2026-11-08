const express = require("express");
const db = require("../db/init");

const router = express.Router();

// GET /api/schools — public, so the registration form can populate a dropdown
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT SchoolID, Name, Location FROM School ORDER BY Name").all());
});

module.exports = router;
