# Edutrack

Edutrack is a Cloudflare Workers app for college attendance and academic management. The existing HTML, CSS, JavaScript, Worker, authentication, permissions, and D1 setup are retained.

## Features

- Owner, moderator, and student workspaces with server-checked roles and permissions.
- Student and academic record management, subject enrollments, attendance history, and audit records.
- Responsive weekly timetable with class periods and highlighted recess entries.
- Live classrooms for authorized owners and moderators. Each mark is saved immediately; ending a classroom records remaining enrolled students as absent.
- Attendance summaries, date and subject filters, student history, monthly trends, and UTF-8 CSV exports that open in Excel.
- In-app classroom notifications and optional browser alerts while Edutrack is open. This project does not implement push delivery to a closed browser.
- Installable app shell. The service worker caches public shell assets only; `/api/` requests and student records remain network-only.

## Database safety

The classroom and reporting updates use the existing `class_sessions`, `attendance`, `audit_logs`, and `routine_periods` tables. Recess is represented within the existing routine-period fields. This update adds no D1 tables, columns, indexes, or migrations, and it adds no package dependencies.

Keep the existing database, migration history, D1 binding, and database ID in `wrangler.toml`. No database command or migration is required for this update. `npm run deploy` deploys the Worker and public assets; it does not apply D1 migrations. Avoid `npm run db:remote` as part of this update.

For local development only, `npm run db:local` applies the repository migrations to the local Wrangler D1 database. Never point a development command at production unless you have separately reviewed and authorized the exact change.

## Local development

1. Install Node.js and run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` for local-only variables. Keep real secrets in `.dev.vars`; do not commit it.
3. Run `npm run db:local` only when setting up a fresh local D1 database.
4. Run `npm run dev` and open the local URL printed by Wrangler.
5. Run `npm run check` to check JavaScript syntax.

Cloudflare deployment settings and the D1 binding are in `wrangler.toml`. Preserve the existing database ID, project name, timezone, and bindings when connecting or deploying through GitHub.

## GitHub upload

Include the application source, `public/`, `migrations/`, `package.json`, `package-lock.json`, `.dev.vars.example`, `.gitignore`, `README.md`, and `wrangler.toml`. Keep the original attendance HTML file if you want to retain it in the repository; the Worker serves the app in `public/`.

Do not upload `.dev.vars`, `.wrangler/`, `node_modules/`, `.git/`, or the local `database/` export folder. `.gitignore` excludes these local files. Keep `.dev.vars.example` as the safe template.

## Notifications and attendance recovery

Classroom status and marks are stored in the existing D1 session, attendance, and audit records. A refresh reloads saved marks from D1. Browser alerts require the user to enable them from the notification panel; they work only while the site is open. Students can view relevant live classroom information but cannot mark, edit, or export other students' attendance.
