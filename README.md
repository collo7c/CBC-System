# CBC Competency Tracking System

A full-stack reference implementation of the system modelled in `Design_Diagrams_Corrected.docx`
(sequence, ER, use-case, class diagrams and database schema). Teachers record CBC (Competency
Based Curriculum) rubric assessments for learners — online or offline — upload learning resources,
and generate progress reports. Administrators manage teacher accounts, view school-wide reports,
and configure the curriculum (strands, sub-strands, competency indicators).

This document explains **what was built, how it maps back to your diagrams, and how to run it.**

---

## 1. Tech stack

| Layer     | Choice | Why |
|-----------|--------|-----|
| Backend   | Node.js + Express | Simple, well documented, easy for a lecturer to read |
| Database  | SQLite via Node's built-in `node:sqlite` module | Zero setup, zero native compilation — the whole DB is one file, matches the schema diagram exactly. Requires **Node.js 22.5+** (uses a module built into Node itself, so there's nothing for npm to compile — no Visual Studio / build tools needed on Windows) |
| Auth      | JWT (`jsonwebtoken`) + `bcryptjs` password hashing | Stateless sessions, standard practice |
| Frontend  | Plain HTML/CSS/JavaScript (no framework, no build step) | Runs by just opening the browser — nothing to compile |
| File uploads | `multer` | Handles the "Upload CBC resources" use case |

No React/Vue/build tooling was used on purpose, so you can open any `.html`/`.js` file and read it
top to bottom for your submission or viva.

---

## 2. How the diagrams became this system

| Diagram | Where it lives in the code |
|---|---|
| **ER diagram / database schema** | `server/db/schema.sql` — one `CREATE TABLE` per entity, foreign keys exactly as drawn, `Teacher`/`Administrator` share `User.UserID` (the ISA relationship) |
| **Sequence diagram** (offline sync) | `public/js/offline.js` (Local Storage queue) + `server/routes/sync.js` (`POST /api/sync`, plays "Sync Service" + "Central Server", returns an acknowledgement exactly like the diagram's "acknowledge receipt" / "sync complete notification" messages) |
| **Use case diagram** | Each use case is a route + a piece of UI. See the mapping table below. |
| **Class diagram** | `Teacher`/`Administrator`/`Resource`(`Learning_Resource`)/`Assessment`(`Competency_Records`)/`SyncEngine` map onto the corresponding route files and the `Sync_Log` table |

### Use case → implementation

| Use case (actor) | Route(s) | UI |
|---|---|---|
| Register and Login (Teacher, Administrator) | `POST /api/auth/register`, `POST /api/auth/login` | `public/index.html` |
| Upload CBC resources (Teacher) | `POST /api/resources` | Teacher dashboard → "CBC learning resources" |
| Record competency assessment (Teacher) | `POST /api/records`, `POST /api/sync` | Teacher dashboard → "Record competency assessment" |
| Generate progress report (Teacher) | `POST /api/reports/generate/:learnerId` | Teacher dashboard → "Generate progress report" |
| Access resource offline (Teacher) | `GET /api/resources` cached to `localStorage` | Teacher dashboard resource table falls back to the cached list when the fetch fails |
| Synchronise data (Teacher) | `POST /api/sync` | "Sync now" button + automatic sync on the browser's `online` event |
| Reset password *(extends Register and Login)* | not implemented — see §7 Known limitations | — |
| Manage teacher accounts (Administrator) | `GET/DELETE /api/admin/teachers` | Admin dashboard → "Manage teacher accounts" |
| View school reports (Administrator) | `GET /api/admin/reports` | Admin dashboard → "School progress reports" |
| Configure curriculum parameters (Administrator) | `POST /api/admin/curriculum/*` | Admin dashboard → "Configure curriculum parameters" |

---

## 3. Project structure

```
cbc-system/
├── server/
│   ├── server.js              Express app entry point
│   ├── db/
│   │   ├── schema.sql         Table definitions (mirrors the ER diagram)
│   │   └── init.js            Creates data/cbc.sqlite on first run and seeds demo data
│   ├── middleware/
│   │   └── auth.js            JWT verification + role guard
│   └── routes/
│       ├── auth.js            Register / login
│       ├── schools.js         Public school list (for the registration form)
│       ├── learners.js        Learner list + a learner's record history
│       ├── curriculum.js      Strand / sub-strand / indicator tree
│       ├── records.js         Create/list competency records (online path)
│       ├── sync.js            Batch sync endpoint (offline path) + sync log
│       ├── reports.js         Generate/list progress reports
│       ├── resources.js       Upload/list learning resources
│       └── admin.js           Teacher management, school reports, curriculum config
├── public/
│   ├── index.html             Login / register page
│   ├── teacher.html           Teacher dashboard
│   ├── admin.html             Administrator dashboard
│   ├── css/style.css
│   └── js/
│       ├── api.js             fetch() wrapper that attaches the JWT
│       ├── offline.js         localStorage queue + sync logic
│       ├── teacher.js         Teacher dashboard behaviour
│       └── admin.js           Admin dashboard behaviour
├── data/                      cbc.sqlite is created here on first run (not committed)
├── uploads/                   Uploaded learning-resource files land here
├── package.json
└── README.md                  You are here
```

---

## 4. Running it

**Requirements:** Node.js **22.5 or newer** (tested on Node 24). Check with `node -v`.

```bash
cd cbc-system
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

> You'll see one line in the terminal like `ExperimentalWarning: SQLite is an experimental
> feature and might change at any time` — that's expected and harmless. It comes from Node's
> built-in `node:sqlite` module and does not affect how the app runs.

On first run, `server/db/init.js` automatically creates `data/cbc.sqlite` and seeds it with:

- 1 school ("Greenview Primary School")
- 1 teacher account and 1 administrator account (demo credentials are set in `server/db/init.js`)
- 3 learners, 1 strand, 1 sub-strand, 2 competency indicators, 2 sample records

Delete `data/cbc.sqlite` at any time to reset to a fresh seeded database.

### Trying the offline-sync flow

1. Sign in as the teacher and open your browser's dev tools → Network tab → set throttling to
   "Offline" (or just turn off your Wi-Fi).
2. Fill in "Record competency assessment" and save — it's queued locally and the header shows
   "Offline" plus a pending-count badge.
3. Go back online. The app auto-syncs (or click "Sync now"). The record moves from *pending* to
   *synced*, exactly as in the sequence diagram.

---

## 5. API reference (short form)

All endpoints except `/api/auth/*`, `/api/schools`, `/api/health` and `/api/resources` (GET)
require `Authorization: Bearer <token>` from `/api/auth/login`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create a teacher/administrator account |
| POST | `/api/auth/login` | — | Get a JWT |
| GET  | `/api/schools` | — | List schools (for registration) |
| GET  | `/api/learners` | any | Learners in the caller's school |
| GET  | `/api/learners/:id/records` | any | A learner's assessment history |
| GET  | `/api/curriculum/indicators` | any | Flat list of competency indicators |
| GET  | `/api/curriculum/strands` | any | Strand → sub-strand → indicator tree |
| POST | `/api/records` | teacher | Save one competency record (online path) |
| GET  | `/api/records` | teacher | Records entered by the caller |
| POST | `/api/sync` | teacher | Batch-push queued offline records |
| GET  | `/api/sync/log` | teacher | Sync history |
| POST | `/api/reports/generate/:learnerId` | teacher | Generate a progress report |
| GET  | `/api/reports/:learnerId` | any | A learner's report history |
| POST | `/api/resources` | teacher | Upload a learning resource (multipart) |
| GET  | `/api/resources` | any | List learning resources |
| GET/DELETE | `/api/admin/teachers[/:id]` | administrator | Manage teacher accounts |
| POST/GET | `/api/assessments` | teacher | Create / list online assessments (questions, grade, access code) |
| GET/PUT/DELETE | `/api/assessments/:id/results`, `/:id/status`, `/:id` | teacher | View results / open or close / delete (only if unanswered) |
| GET | `/api/assess/:code` | none (access code) | Learner opens an assessment — questions without answers |
| POST | `/api/assess/:code/submit` | none (access code) | Learner submits; system marks it and records a competency level |
| GET/POST | `/api/admin/administrators` | administrator | List / create administrators (only way to get admin access) |
| GET/POST | `/api/admin/learners` | administrator | List / add learners (with grade assignment) |
| PUT/DELETE | `/api/admin/learners/:id` | administrator | Edit name or change grade / remove learner (blocked if they have records) |
| GET  | `/api/admin/reports` | administrator | All progress reports in the school |
| GET  | `/api/admin/overview` | administrator | Dashboard counts |
| POST | `/api/admin/curriculum/{strand,substrand,indicator}` | administrator | Configure curriculum |

---

## 6. Troubleshooting

**"Could not find a version of Visual Studio" / `node-gyp` errors during `npm install`:**
this shouldn't happen with this version of the project — it no longer depends on any native
module. If you still see it, you likely have a stray `better-sqlite3` entry in `package-lock.json`
from an older copy; delete `node_modules` and `package-lock.json` and re-run `npm install`.

**"node:sqlite" not found / `ERR_UNKNOWN_BUILTIN_MODULE`:** your Node.js version is older than
22.5. Run `node -v` and upgrade from https://nodejs.org if needed.

## 7. Known limitations / good next steps to mention to your lecturer

- **Reset password** (the `<<extend>>` use case) is not implemented — there's no email service
  wired up. Worth adding as a follow-up (e.g. a token emailed via a service like SendGrid).
- Offline caching only covers the **resource list**, not the file bytes themselves — a true
  "access resource offline" implementation would use the Cache API / Service Worker to store the
  actual files.
- Single JWT secret hard-coded as a dev default in `server/middleware/auth.js` — set the
  `JWT_SECRET` environment variable before deploying anywhere real.
- No automated test suite yet; the flows above were verified manually via `curl` against every
  route. Adding Jest + Supertest tests would be a natural extension.
- `node:sqlite` is fine for a single-instance demo/project; a production deployment serving many
  schools would want PostgreSQL/MySQL — the schema in `schema.sql` translates directly.

