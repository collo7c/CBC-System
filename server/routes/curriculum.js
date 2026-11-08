const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/curriculum/indicators — flattened list for the assessment-entry dropdown
router.get("/indicators", (req, res) => {
  const rows = db
    .prepare(
      `SELECT ci.IndicatorID, ci.Description, ss.Name AS SubStrandName, s.Name AS StrandName
       FROM Competency_Indicator ci
       JOIN Sub_Strand ss ON ss.SubStrandID = ci.SubStrandID
       JOIN Strand s ON s.StrandID = ss.StrandID
       ORDER BY s.Name, ss.Name, ci.Description`
    )
    .all();
  res.json(rows);
});

// GET /api/curriculum/strands — full tree (Strand -> Sub_Strand -> Indicator), matches "Contains"/"Defines"
router.get("/strands", (req, res) => {
  const strands = db.prepare("SELECT * FROM Strand ORDER BY Name").all();
  const subStrands = db.prepare("SELECT * FROM Sub_Strand ORDER BY Name").all();
  const indicators = db.prepare("SELECT * FROM Competency_Indicator").all();

  const tree = strands.map((s) => ({
    ...s,
    subStrands: subStrands
      .filter((ss) => ss.StrandID === s.StrandID)
      .map((ss) => ({
        ...ss,
        indicators: indicators.filter((ci) => ci.SubStrandID === ss.SubStrandID),
      })),
  }));
  res.json(tree);
});

module.exports = router;
