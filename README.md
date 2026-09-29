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
| 3     | Admin dashboard and CRUD (users, students, classrooms, …)            | Users and classroom assignments done; subjects, competencies, activity logs and reporting remain |
| 4     | Teacher modules (classrooms, students, schedule, assessments, scores) | Session scheduling, attendance review, and session rooms with chat/audio/screen sharing done; assessments and scores remain |
| 5     | Salary configuration and calculation                                  | Not started |
| 6     | Security hardening                                                    | Partly done (see below) |
| 7     | Testing                                                               | Auth, users, announcements, classrooms, scheduling and attendance covered |
| 8     | Deployment                                                            | Configured (GitHub Pages + Render) |

Sidebar links for modules that are not built yet open a "Not built yet" page.

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

Free Render services sleep after 15 minutes idle, so the first request after that can take up to a minute.

### Client on GitHub Pages (one time)

1. The repository must be **public** for free GitHub Pages.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables → New repository variable:** `VITE_API_URL` = `https://<service-name>.onrender.com/api`.
4. **Actions → Deploy client to GitHub Pages → Run workflow.**

After that, every push to `master` that changes `client/` redeploys the site (`.github/workflows/deploy-client.yml`).

## Environment variables

**Server** (`server/.env`): `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN` (default `1d`), `CLIENT_URL` (comma-separated allowed origins), `TRUST_PROXY` (set to `1` behind Render/Railway/Nginx), `SEED_*`.

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
| GET    | `/api/classrooms` | Admin; assigned teacher | List active classrooms (or `?includeArchived=true`); teacher results are scoped to their assigned classrooms |
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

Recurring schedule date ranges are inclusive; `weekdays` uses JavaScript day numbers (`0` Sunday through `6` Saturday) and `timezone` is an IANA timezone. Editing an occurrence replaces its date and times; editing a series applies the selected occurrence's local start/end clock times and title while retaining each occurrence's date. Each session's attendance condition is on by default: check-ins through the first five minutes are present, later in-session check-ins are late, and students who never check in are absent after the session ends. Teachers can turn conditions off for an occurrence; check-ins are still limited to the scheduled session, but all students who check in during it are present regardless of arrival time. Check-in is idempotent. Ended sessions are marked absent when sessions or attendance are read.

### Session rooms (prototype)

Teachers and assigned students can open a session room for persistent group chat, participant presence, microphone mute/unmute, and one screen share at a time. Rooms are capped at 12 participants. Cameras and file uploads are not included. Chat messages are stored in MongoDB; live audio and screen tracks are sent directly between browsers using a peer-to-peer WebRTC mesh, while the Express server authenticates participants and relays signaling over Socket.IO. The room uses a public STUN server and does not include a TURN relay or SFU media server. Consequently, media may not connect through some firewalls/NATs, and a mesh of a full classroom can use significant device/network resources; this prototype does not guarantee production-grade 12-person calls. Microphone and screen sharing require browser permission and HTTPS (localhost is allowed for development). The Render API must allow the GitHub Pages origin in `CLIENT_URL`; `render.yaml` includes the deployed Pages origin.

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
  models/        Mongoose schemas (User, Announcement, ActivityLog, ClassSession, SessionMessage)
  realtime/      authenticated Socket.IO room presence, chat, and WebRTC signaling
  routes/        route definitions, mounted under /api
  services/      business logic (auth, user, announcement)
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
