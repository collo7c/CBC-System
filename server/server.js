const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db/init"); // ensures DB exists + is seeded before routes touch it

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/schools", require("./routes/schools"));
app.use("/api/learners", require("./routes/learners"));
app.use("/api/curriculum", require("./routes/curriculum"));
app.use("/api/records", require("./routes/records"));
app.use("/api/sync", require("./routes/sync"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/resources", require("./routes/resources"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/assessments", require("./routes/assessments")); // teacher: create / manage / results
app.use("/api/assess", require("./routes/assess"));           // learner: open by code, answer, submit

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`CBC Competency Tracking System running at http://localhost:${PORT}`);
});
