-- CBC Competency Tracking System schema
-- Mirrors the corrected ER diagram / database schema in Design_Diagrams_Corrected.docx

CREATE TABLE IF NOT EXISTS School (
  SchoolID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Name        TEXT NOT NULL,
  Location    TEXT
);

CREATE TABLE IF NOT EXISTS User (
  UserID      INTEGER PRIMARY KEY AUTOINCREMENT,
  Name        TEXT NOT NULL,
  Email       TEXT NOT NULL UNIQUE,
  PasswordHash TEXT NOT NULL,
  Role        TEXT NOT NULL CHECK (Role IN ('teacher','administrator')),
  SchoolID    INTEGER NOT NULL REFERENCES School(SchoolID)
);

CREATE TABLE IF NOT EXISTS Teacher (
  UserID      INTEGER PRIMARY KEY REFERENCES User(UserID) ON DELETE CASCADE,
  TSCNumber   TEXT
);

CREATE TABLE IF NOT EXISTS Administrator (
  UserID      INTEGER PRIMARY KEY REFERENCES User(UserID) ON DELETE CASCADE,
  Department  TEXT
);

CREATE TABLE IF NOT EXISTS Learner (
  LearnerID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Name        TEXT NOT NULL,
  GradeLevel  TEXT NOT NULL,
  SchoolID    INTEGER NOT NULL REFERENCES School(SchoolID)
);

CREATE TABLE IF NOT EXISTS Strand (
  StrandID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Sub_Strand (
  SubStrandID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name        TEXT NOT NULL,
  StrandID    INTEGER NOT NULL REFERENCES Strand(StrandID)
);

CREATE TABLE IF NOT EXISTS Competency_Indicator (
  IndicatorID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Description   TEXT NOT NULL,
  SubStrandID   INTEGER NOT NULL REFERENCES Sub_Strand(SubStrandID)
);

CREATE TABLE IF NOT EXISTS Competency_Records (
  RecordID          INTEGER PRIMARY KEY AUTOINCREMENT,
  RubricLevel       TEXT NOT NULL CHECK (RubricLevel IN ('Exceeds','Meets','Approaches','Below')),
  ObservationNotes  TEXT,
  LearnerID         INTEGER NOT NULL REFERENCES Learner(LearnerID),
  TeacherID         INTEGER NOT NULL REFERENCES Teacher(UserID),
  IndicatorID       INTEGER NOT NULL REFERENCES Competency_Indicator(IndicatorID),
  SyncStatus        TEXT NOT NULL DEFAULT 'pending' CHECK (SyncStatus IN ('pending','synced')),
  ClientUUID        TEXT UNIQUE,          -- id assigned offline, on the client, before sync
  CreatedAt         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Progress_Report (
  ReportID          INTEGER PRIMARY KEY AUTOINCREMENT,
  DateGenerated     TEXT NOT NULL DEFAULT (datetime('now')),
  AttainmentSummary TEXT NOT NULL,
  LearnerID         INTEGER NOT NULL REFERENCES Learner(LearnerID)
);

CREATE TABLE IF NOT EXISTS Sync_Log (
  LogID       INTEGER PRIMARY KEY AUTOINCREMENT,
  Status      TEXT NOT NULL,
  Timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  TeacherID   INTEGER NOT NULL REFERENCES Teacher(UserID),
  RecordCount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Learning_Resource (
  ResourceID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Title        TEXT NOT NULL,
  FilePath     TEXT NOT NULL,
  SyncStatus   TEXT NOT NULL DEFAULT 'synced',
  TeacherID    INTEGER NOT NULL REFERENCES Teacher(UserID),
  SubStrandID  INTEGER NOT NULL REFERENCES Sub_Strand(SubStrandID)
);

-- ---------- Online assessments (learners answer questions; the system marks them) ----------
CREATE TABLE IF NOT EXISTS Assessment (
  AssessmentID INTEGER PRIMARY KEY AUTOINCREMENT,
  Title        TEXT NOT NULL,
  AccessCode   TEXT NOT NULL UNIQUE,          -- the code learners type to open it
  GradeLevel   TEXT NOT NULL,
  Status       TEXT NOT NULL DEFAULT 'open' CHECK (Status IN ('open','closed')),
  IndicatorID  INTEGER NOT NULL REFERENCES Competency_Indicator(IndicatorID),
  TeacherID    INTEGER NOT NULL REFERENCES Teacher(UserID),
  SchoolID     INTEGER NOT NULL REFERENCES School(SchoolID),
  CreatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Assessment_Question (
  QuestionID    INTEGER PRIMARY KEY AUTOINCREMENT,
  AssessmentID  INTEGER NOT NULL REFERENCES Assessment(AssessmentID) ON DELETE CASCADE,
  Prompt        TEXT NOT NULL,
  OptionA       TEXT NOT NULL,
  OptionB       TEXT NOT NULL,
  OptionC       TEXT NOT NULL,
  OptionD       TEXT NOT NULL,
  CorrectOption TEXT NOT NULL CHECK (CorrectOption IN ('A','B','C','D'))
);

CREATE TABLE IF NOT EXISTS Assessment_Attempt (
  AttemptID    INTEGER PRIMARY KEY AUTOINCREMENT,
  AssessmentID INTEGER NOT NULL REFERENCES Assessment(AssessmentID) ON DELETE CASCADE,
  LearnerID    INTEGER NOT NULL REFERENCES Learner(LearnerID),
  Score        INTEGER NOT NULL,
  Total        INTEGER NOT NULL,
  RubricLevel  TEXT NOT NULL CHECK (RubricLevel IN ('Exceeds','Meets','Approaches','Below')),
  RecordID     INTEGER REFERENCES Competency_Records(RecordID),  -- the competency record this attempt produced
  SubmittedAt  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (AssessmentID, LearnerID)            -- one attempt per learner
);
