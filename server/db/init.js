const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite"); // built into Node 22+, nothing to compile
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "..", "data", "cbc.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const isNew = !fs.existsSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

if (isNew) {
  seed();
  console.log("Database created and seeded at", DB_PATH);
} else {
  console.log("Using existing database at", DB_PATH);
}

function seed() {
  const insertSchool = db.prepare("INSERT INTO School (Name, Location) VALUES (?, ?)");
  const school = insertSchool.run("Greenview Primary School", "Nairobi, Kenya");
  const schoolId = school.lastInsertRowid;

  const insertUser = db.prepare(
    "INSERT INTO User (Name, Email, PasswordHash, Role, SchoolID) VALUES (?, ?, ?, ?, ?)"
  );
  const insertTeacher = db.prepare("INSERT INTO Teacher (UserID, TSCNumber) VALUES (?, ?)");
  const insertAdmin = db.prepare("INSERT INTO Administrator (UserID, Department) VALUES (?, ?)");

  const teacherPass = bcrypt.hashSync("teacher123", 10);
  const adminPass = bcrypt.hashSync("admin123", 10);

  const teacherId = insertUser.run("Jane Wanjiru", "teacher@cbc.test", teacherPass, "teacher", schoolId).lastInsertRowid;
  insertTeacher.run(teacherId, "TSC-88213");

  const adminId = insertUser.run("Peter Kamau", "admin@cbc.test", adminPass, "administrator", schoolId).lastInsertRowid;
  insertAdmin.run(adminId, "Academics");

  const insertLearner = db.prepare("INSERT INTO Learner (Name, GradeLevel, SchoolID) VALUES (?, ?, ?)");
  const learnerIds = [
    insertLearner.run("Amani Otieno", "Grade 4", schoolId).lastInsertRowid,
    insertLearner.run("Brian Mutua", "Grade 4", schoolId).lastInsertRowid,
    insertLearner.run("Cynthia Achieng", "Grade 5", schoolId).lastInsertRowid,
  ];

  const insertStrand = db.prepare("INSERT INTO Strand (Name) VALUES (?)");
  const strandId = insertStrand.run("Mathematical Activities").lastInsertRowid;

  const insertSubStrand = db.prepare("INSERT INTO Sub_Strand (Name, StrandID) VALUES (?, ?)");
  const subStrandId = insertSubStrand.run("Numbers: Addition and Subtraction", strandId).lastInsertRowid;

  const insertIndicator = db.prepare(
    "INSERT INTO Competency_Indicator (Description, SubStrandID) VALUES (?, ?)"
  );
  const indicatorIds = [
    insertIndicator.run("Adds two 2-digit numbers with regrouping", subStrandId).lastInsertRowid,
    insertIndicator.run("Subtracts two 2-digit numbers with borrowing", subStrandId).lastInsertRowid,
  ];

  const insertRecord = db.prepare(`
    INSERT INTO Competency_Records
      (RubricLevel, ObservationNotes, LearnerID, TeacherID, IndicatorID, SyncStatus, ClientUUID)
    VALUES (?, ?, ?, ?, ?, 'synced', ?)
  `);
  insertRecord.run("Meets", "Confident with regrouping in most cases.", learnerIds[0], teacherId, indicatorIds[0], "seed-0001");
  insertRecord.run("Approaches", "Needs more practice borrowing across zeros.", learnerIds[1], teacherId, indicatorIds[1], "seed-0002");
}

module.exports = db;
