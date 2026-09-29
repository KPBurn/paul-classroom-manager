# Classroom and Teacher Management System

A full-stack web app for managing classrooms, students, competencies, schedules, scores and teacher salaries, with separate **Administrator**, **Teacher** and **Student** portals.

| Layer    | Stack                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Client   | React 19, Vite, React Router, Tailwind CSS, Axios, React Hook Form, Zod  |
| Server   | Node.js (≥ 22.9), Express 5, Mongoose, JWT, bcryptjs, Helmet, Zod        |
| Database | MongoDB Atlas                                                            |

```
client/   React + Vite single-page app (admin, teacher and student portals)
server/   Express REST API — the only thing that talks to MongoDB
```

## Development status

| Phase | Scope                                                                | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 1     | Project setup, environment config, API connection                    | ✅ Done |
| 2     | Authentication, password hashing, JWT, RBAC, protected routes        | ✅ Done |
| 3     | Admin dashboard and CRUD (users, students, classrooms, …)        | Users and multiple-teacher classroom assignments done; admin subject management, competencies, activity logs and reporting remain |
| 4     | Teacher modules (classrooms, subjects, students, schedule, assessments, scores) | Teachers can create subjects for assigned classrooms and share scheduled materials; assessments and scores remain |
| 5     | Salary configuration and calculation                                  | Not started |
| 6     | Security hardening                                                    | Partly done (see below) |
| 7     | Testing                                                               | Auth, users, announcements, classrooms, scheduling and attendance covered |
| 8     | Deployment                                                            | Configured (GitHub Pages + Render) |

Sidebar links for modules that are not built yet open a "Not built yet" page.

Scheduling a class updates the classroom's ongoing teacher and student assignments. Each scheduled session also stores an assignment snapshot, so later classroom roster changes do not rewrite the participants for existing sessions or attendance history.

Attendance is recorded automatically when teachers and students join a session room during its scheduled time, including arrival status and time attended; assigned people who never join are marked absent after the session ends. Open classrooms also add participant join and leave notices to the room chat.

### Teacher's feedback

Teachers write individual feedback for each student after a lesson from **Teacher's Feedback**: choose a class, then a lesson they taught, then a student. Each record covers what was learned, vocabulary (new words and words used independently), grammar (topic, understanding, accuracy), 1–5 star ratings for fluency, pronunciation and confidence, what the student did well, what needs improvement, a recommendation for the next lesson, and optional notes. Class, date, time and schedule come from the lesson; the book defaults to the one used last for the class. Drafts can be saved incomplete; submitting requires the lesson summary, all three ratings and the three evaluation sections, then moves on to the next student. There is one record per student per lesson. Only the teacher who wrote feedback can edit it; the lesson's other teachers can read it, admins can read all feedback under **Teacher Feedback**, and students have no access.

### Subjects and class materials

Teachers add materials from an assigned active classroom's page (**My Classrooms → the class → Materials → Add material**), choosing one of the class's subjects (for example, English 101) or creating a new one there. The classroom's existing name can represent its batch (for example, 2021). Each material is one file or image up to 8 MB with an optional title and description; teachers can make it available immediately or schedule its release, and can delete it. PNG, JPEG, GIF and WebP images show thumbnails and, like PDFs, can be previewed in the app; other types (including SVG and HTML, which can run scripts) are only ever served as downloads. Active students can see and download materials only while they are members of that active classroom, and the API checks both membership and the release time on every download. Subject files are stored in MongoDB.

Administrators can temporarily enable password-free role testing from **Admin → Settings**. This allows any visitor to the login page to enter as an active account of the selected role, including an administrator account. Use only for a controlled test and disable immediately afterward; existing role-test sessions are revoked as soon as the setting is turned off.

## Getting started

### 1. Configure the server

`server/.env` is not committed. Copy the template if you don't have one:

```bash
cp server/.env.example server/.env
```

Then fill in:

| Variable                  | What to put there                                                                 |
| ------------------------- | --------------------------------------------------------------------------------- |
| `MONGODB_URI`             | Your Atlas connection string (Atlas → **Database** → **Connect** → **Drivers**). Include a database name, e.g. `…mongodb.net/ctms?…` |
| `JWT_SECRET`              | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SEED_ADMIN_PASSWORD`     | Password for the first admin account (8–72 chars, a letter and a number)          |
| `SEED_TEACHER_PASSWORD`   | Optional demo teacher account; leave empty to skip                                |
| `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD` | Optional Paul student account; leave both empty to skip |

In Atlas, also allow your IP under **Network Access**.

### 2. Install, seed and run

```bash
# API — http://localhost:5050/api
cd server
npm install
npm run seed    # creates configured admin, demo teacher, and Paul student; safe to re-run
npm run dev

# Client — http://localhost:5173 (in a second terminal)
cd client
npm install
npm run dev
```

Sign in with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `server/.env`.

The API requires a reachable MongoDB database in both development and production. If MongoDB is unavailable, startup fails instead of silently using temporary data. Login checks the submitted email and password against the persisted user record. Create the initial admin in the configured database with `npm run seed` before signing in.

> The API uses port **5050**, not 5000: on Windows, port 5000 is often held by a system service.

### 3. Run the tests

```bash
cd server
npm test
```

Tests use an in-memory MongoDB (`mongodb-memory-server`), so they never touch Atlas. The first run downloads a MongoDB binary.

## Deployment

| Part   | Host                     | URL                                   |
| ------ | ------------------------ | ------------------------------------- |
| Client | GitHub Pages (free)      | https://kpburn.github.io/paul-classroom-manager/ |
| API    | Render free web service  | `https://<service-name>.onrender.com` |
| DB     | MongoDB Atlas            | —                                     |

GitHub Pages only serves static files, so the API runs on Render.

### API on Render (one time)

1. In [Render](https://render.com): **New → Blueprint**, connect this repository. `render.yaml` defines the service.
2. When prompted, enter `MONGODB_URI` (the same Atlas string as `server/.env`). `JWT_SECRET` is generated automatically.
3. To provision the initial admin and optional demo accounts, temporarily add the matching `SEED_*_EMAIL` and `SEED_*_PASSWORD` environment variables in the Render dashboard. The service seeds only missing accounts on startup; remove those variables after the first successful deploy.
4. In Atlas → **Network Access**, allow Render's outbound IP ranges for the service's region.
5. Once deployed, open `https://<service-name>.onrender.com/api/health` and check it says `"database":"connected"`.
6. For reliable classroom audio/video, activate a Metered TURN plan and create an active TURN credential. In Metered's **Developers** page, copy the workspace's Metered domain for `METERED_TURN_HOST`; in **TURN Server → Credentials**, open that credential's **Get credential → Show API Key** and use its credential-scoped key for `METERED_TURN_API_KEY`. Add both values to the Render service's **Environment** settings. Do not use the workspace Secret Key: it is not accepted by the credential-fetch endpoint. Keep the TURN API key in Render only; never add it to GitHub Pages or client variables. Redeploy the API after setting both values.

Free Render services sleep after 15 minutes idle, so the first request after that can take up to a minute.

### Client on GitHub Pages (one time)

1. The repository must be **public** for free GitHub Pages.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables → New repository variable:** `VITE_API_URL` = `https://<service-name>.onrender.com/api`.
4. **Actions → Deploy client to GitHub Pages → Run workflow.**

After that, every push to `master` that changes `client/` redeploys the site (`.github/workflows/deploy-client.yml`).

## Environment variables

**Server** (`server/.env`): `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN` (default `1d`), `CLIENT_URL` (comma-separated allowed origins), `TRUST_PROXY` (set to `1` behind Render/Railway/Nginx), `WEBRTC_ICE_SERVERS` (optional JSON array with STUN/TURN definitions), `METERED_TURN_HOST` and `METERED_TURN_API_KEY` (configure both with the TURN domain and the API key for an active TURN credential), `SEED_*`. The Metered TURN API key is never sent to the browser; only the ICE server credentials needed by authenticated room participants are returned. When TURN is configured, classroom media uses relay-only ICE to work through restrictive networks; this relays media traffic through the TURN provider and counts against its quota. Without TURN credentials, rooms use normal ICE and show a warning because direct connections can fail on restrictive networks.

**Client** (`client/.env`): `VITE_API_URL` only. Everything in the client bundle is public, so database credentials and JWT secrets must never go there.

## API

All responses use one envelope:

```json
{ "success": true,  "message": "Login successful", "data": { } }
{ "success": false, "message": "Validation failed", "error": "One or more fields are invalid",
  "details": [{ "field": "email", "message": "Enter a valid email address" }] }
```

Authenticated requests send `Authorization: Bearer <token>`.

| Method | Endpoint             | Access        | Description                                            |
| ------ | -------------------- | ------------- | ------------------------------------------------------ |
| GET    | `/api/health`        | Public        | API and database status                                |
| POST   | `/api/auth/login`    | Public        | `{ email, password }` → `{ user, token }`. Rate limited to 10 failed attempts / 15 min |
| GET    | `/api/auth/me`       | Signed in     | Current user                                           |
| POST   | `/api/auth/logout`   | Signed in     | Records the sign-out; the client discards the token    |
| POST   | `/api/auth/register` | `users:create` | Create an account `{ firstName, lastName, email, password, role?, status? }` (same as `POST /api/users`) |
| GET    | `/api/users`         | `users:read`   | List users. Query: `page`, `limit` (≤ 100), `search` (name or email), `role`, `status`. Sorted by last name |
| POST   | `/api/users`         | `users:create` | Create a user `{ firstName, lastName, email, password, role?, status? }` |
| GET    | `/api/users/:id`     | `users:read`   | One user                                               |
| PATCH  | `/api/users/:id`     | `users:update` | Change any of `{ firstName, lastName, email, role, status }` |
| PUT    | `/api/users/:id/password` | `users:update` | `{ password }`. Signs the user out of every session |
| DELETE | `/api/users/:id`     | `users:delete` | Delete a user. Refused for users who created announcements; deactivate them instead |
| GET    | `/api/announcements` | `announcements:read` | School-wide announcements, newest first. Query: `page`, `limit`, `status` (`active` or `archived`; archived needs `announcements:update`) |
| POST   | `/api/announcements` | `announcements:create` | Create a school-wide announcement `{ title, body, type }` |
| PATCH  | `/api/announcements/:id` | `announcements:update`; classroom teacher | Edit `{ title?, body?, type? }`. Teachers can edit announcements in classrooms they teach |
| POST   | `/api/announcements/:id/archive` | `announcements:update`; classroom teacher | Hide an announcement without deleting it (`/restore` undoes it) |
| DELETE | `/api/announcements/:id` | `announcements:delete`; classroom teacher | Permanently delete an announcement |
| GET    | `/api/classrooms` | Admin; assigned teacher; enrolled student | List active classrooms (or `?includeArchived=true`); teacher and student results are scoped to their own classrooms, and students see class size instead of the roster |
| GET    | `/api/classrooms/:id` | Admin; assigned teacher; enrolled student | One classroom, shaped the same way as the list |
| GET    | `/api/classrooms/:id/announcements` | Admin; assigned teacher; enrolled student | Classroom announcements. Query: `page`, `limit`, `status` (archived for teachers and admins only) |
| POST   | `/api/classrooms/:id/announcements` | Admin; assigned teacher | Post `{ title, body, type }` to an active classroom |
| POST   | `/api/classrooms` | Admin | Create `{ name, teacherId, studentIds }` with active assigned users |
| PATCH  | `/api/classrooms/:id` | Admin | Update classroom name or assignments |
| POST   | `/api/classrooms/:id/archive` | Admin | Archive a classroom without deleting its history |
| GET    | `/api/sessions` | Teacher | List sessions in teacher-assigned classrooms |
| GET    | `/api/sessions?view=mine` | Student | List sessions in the student's classrooms |
| POST   | `/api/sessions` | Assigned teacher | Create `{ classroomId, title, startsAt, endsAt }` or a weekly schedule with `{ classroomId, title, startDate, endDate, startTime, endTime, weekdays, timezone }` |
| GET    | `/api/sessions/:id/messages` | Assigned teacher or student | Read the latest 100 persistent room chat messages |
| PATCH  | `/api/sessions/:id` | Assigned teacher | Edit an occurrence or series using `{ scope, ...changes }` |
| POST   | `/api/sessions/:id/cancel` | Assigned teacher | Cancel `{ scope: "occurrence" \| "series" }`, returning `{ items }` |
| POST   | `/api/sessions/:id/check-in` | Assigned student | Check in during the session |
| GET    | `/api/sessions/:id/attendance` | Assigned teacher | Read `{ items: [{ student: { id, name, email }, status, checkInAt }] }`; ended sessions acquire absent records when read |
| PATCH  | `/api/sessions/:id/attendance/:studentId` | Assigned teacher | Correct `{ status: "present" \| "late" \| "absent" }`, returning `{ attendance }` |
| GET    | `/api/feedback` | Teacher (own); admin (all) | Feedback history. Query: `page`, `limit`, `classroomId`, `studentId`, `teacherId` (admin), `status`, `from`, `to` |
| GET    | `/api/feedback/lessons/:sessionId` | Lesson teacher; admin | The lesson's students with their feedback status, plus the last book used for the class |
| GET    | `/api/feedback/:id` | Author; lesson teachers; admin | One feedback record |
| POST   | `/api/feedback` | Lesson teacher | Create `{ sessionId, studentId, ...content, status: "draft" \| "completed" }` |
| PATCH  | `/api/feedback/:id` | Author | Update content or submit with `status: "completed"` |

Recurring schedule date ranges are inclusive; `weekdays` uses JavaScript day numbers (`0` Sunday through `6` Saturday) and `timezone` is an IANA timezone. Editing an occurrence replaces its date and times; editing a series applies the selected occurrence's local start/end clock times and title while retaining each occurrence's date. Each session's attendance condition is on by default: check-ins through the first five minutes are present, later in-session check-ins are late, and students who never check in are absent after the session ends. Teachers can turn conditions off for an occurrence; check-ins are still limited to the scheduled session, but all students who check in during it are present regardless of arrival time. Check-in is idempotent. Ended sessions are marked absent when sessions or attendance are read.

### Session rooms (prototype)

Teachers and assigned students can open a session room for persistent group chat, participant presence, microphone mute/unmute, camera video, screen sharing, and file sharing. Standard rooms are capped at 12 participants. Administrators can designate an **open classroom**, whose rooms allow any signed-in active account and are capped at 20 participants. The assigned teacher can independently enable or disable screen sharing and file uploads; the server enforces both settings for every participant. Room files are limited to 8 MB and are removed when the session ends or is cancelled. Chat and temporary file data are stored in MongoDB; live media is sent directly between browsers over a peer-to-peer WebRTC mesh, while the Express server authenticates participants and relays signaling over Socket.IO. The room defaults to a public STUN server; configure Metered Open Relay or `WEBRTC_ICE_SERVERS` with TURN server definitions to support restrictive school/firewall networks. The Metered API key stays server-side and provider-issued ICE credentials are returned only to authenticated room participants. Larger meshes can use significant device/network resources. Microphone, camera, and screen sharing require browser permission and HTTPS (localhost is allowed for development). The Render API must allow the GitHub Pages origin in `CLIENT_URL`; `render.yaml` includes the deployed Pages origin.

Teachers of a session (and admins) can moderate its room from the People tab: mute a student or everyone, remove a participant (who cannot rejoin that session until a teacher allows them back), and, from the Leave button, end the class for everyone. An ended class stays closed to students until a teacher reopens it from the room. Removals and ended classes are stored on the session, so they survive server restarts. Teachers and admins cannot be moderated.

### Authentication and authorization (RBAC)

- Passwords are hashed with bcrypt (12 rounds) and never returned by the API.
- `authenticateUser` verifies the JWT **and reloads the user on every request**, so deactivating an account or changing its role takes effect immediately. Each token also carries the user's `tokenVersion`; a password reset bumps it, which revokes every older token.
- Routes are guarded with `requirePermission(...)`. Which role has which permission is defined in one place, `server/src/config/permissions.js`:

  | Permission             | admin | teacher | student |
  | ---------------------- | :---: | :-----: | :-----: |
  | `users:read`           | ✅    |         |         |
  | `users:create`         | ✅    |         |         |
  | `users:update`         | ✅    |         |         |
  | `users:delete`         | ✅    |         |         |
  | `announcements:read`   | ✅    | ✅      |         |
  | `announcements:create` | ✅    |         |         |
  | `announcements:update` | ✅    |         |         |
  | `announcements:delete` | ✅    |         |         |

  Classroom announcements are the exception: a classroom's teachers can post, edit, archive and delete its announcements, and its enrolled students can read them. The service checks classroom membership on every request.

- `/api/auth/login` and `/api/auth/me` return the user's `permissions`, and the client uses `hasPermission(user, …)` (`client/src/utils/roles.js`) to hide actions. The React route guards and hidden buttons are only for UX; the API enforces every rule.
- Administrators cannot change their own role or status, or delete their own account, so they cannot lock themselves out.
- Login returns the same error for an unknown email and a wrong password, and takes the same time for both.
- Active students, teachers, and admins can sign in. Students have no administrative or teacher permissions.
- There is no public sign-up. Administrators create accounts.

### Security already in place

Helmet headers, a CORS allow-list, JSON body size limit (100 kb), rate limiting (500 req / 15 min per IP overall), removal of `$` and dotted keys from request bodies (NoSQL injection), Zod validation, and centralized error handling that never exposes stack traces.

## Project structure

```
server/src/
  config/        environment.js (validated env), database.js, permissions.js (RBAC map)
  controllers/   thin HTTP handlers
  middleware/    auth, role/permission, validation, sanitize, rate limit, error
  models/        Mongoose schemas (User, Announcement, ActivityLog, Classroom, Subject, SubjectMaterial, ClassSession, SessionMessage)
  realtime/      authenticated Socket.IO room presence, chat, and WebRTC signaling
  routes/        route definitions, mounted under /api
  services/      business logic (auth, user, announcement, subject materials)
  utils/         jwt, password, AppError, apiResponse, activityLogger
  validators/    Zod request schemas
  scripts/       seed.js
server/tests/    node:test + supertest suites

client/src/
  components/    common (Button, TextField, Alert…), navigation (Sidebar, Topbar, DashboardLayout), dashboard
  config/        navigation.js — sidebar structure per portal
  context/       AuthContext (session state)
  hooks/         useAuth
  layouts/       AdminLayout, TeacherLayout
  pages/         auth, admin, teacher, student, shared (including the live session room)
  routes/        AppRoutes, ProtectedRoute / GuestRoute
  services/      api.js (Axios instance), auth, user and announcement services
  utils/         roles (roles, permissions, hasPermission), errors, format, tokenStorage
```
