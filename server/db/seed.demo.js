// Optional demo data: gives each learner a realistic history so the insights and charts have something to show.
//   node server/db/seed-demo.js           add demo records (safe to run twice)
//   node server/db/seed-demo.js --reset   remove the demo records again (do this before submitting)
const db = require("./init");

if (process.argv.includes("--reset")) {
  const info = db.prepare("DELETE FROM Competency_Records WHERE ClientUUID LIKE 'demo-%'").run();
  console.log(`Removed ${info.changes} demo records.`);
  process.exit(0);
}
if (db.prepare("SELECT 1 FROM Competency_Records WHERE ClientUUID LIKE 'demo-%' LIMIT 1").get()) {
  console.log("Demo data is already there. Use --reset to remove it.");
  process.exit(0);
}

const teacher = db.prepare("SELECT UserID FROM Teacher ORDER BY UserID LIMIT 1").get();
const learners = db.prepare("SELECT LearnerID, Name FROM Learner ORDER BY LearnerID").all();
const indicators = db.prepare("SELECT IndicatorID FROM Competency_Indicator ORDER BY IndicatorID").all();
if (!teacher || learners.length < 3 || !indicators.length) {
  console.log("Need a teacher, at least 3 learners and 1 indicator first.");
  process.exit(1);
}

// [days ago, level] — oldest first
const stories = [
  { who: learners[0], note: "Improving steadily",
    data: [[56,"Approaches"],[49,"Approaches"],[42,"Meets"],[35,"Meets"],[28,"Meets"],[21,"Exceeds"],[14,"Meets"],[7,"Exceeds"]] },
  { who: learners[1], note: "Was doing well, now struggling",
    data: [[56,"Exceeds"],[49,"Exceeds"],[42,"Meets"],[35,"Meets"],[28,"Approaches"],[21,"Below"],[14,"Below"],[7,"Approaches"]] },
  { who: learners[2], note: "Not assessed recently",
    data: [[62,"Meets"],[55,"Approaches"],[50,"Meets"]] },
];

const ins = db.prepare(
  `INSERT INTO Competency_Records (RubricLevel, ObservationNotes, LearnerID, TeacherID, IndicatorID, SyncStatus, ClientUUID, CreatedAt)
   VALUES (?, ?, ?, ?, ?, 'synced', ?, datetime('now', ?))`
);
let n = 0;
for (const s of stories) {
  s.data.forEach(([days, level], i) => {
    ins.run(level, `Demo: ${s.note}`, s.who.LearnerID, teacher.UserID, indicators[i % indicators.length].IndicatorID,
            `demo-${s.who.LearnerID}-${i}`, `-${days} days`);
    n++;
  });
}
console.log(`Added ${n} demo records for ${stories.map((s) => s.who.Name).join(", ")}.`);