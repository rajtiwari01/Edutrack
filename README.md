# Edutrack

Edutrack is a mobile-first attendance and academic management app. The public site uses ordinary HTML, CSS, and JavaScript. A Cloudflare Worker serves the site and API; Cloudflare D1 stores college data. The Worker and GitHub project use the technical name `edunest`; the visible product is Edutrack.

## Current features

- Owner sign-in, college registration, and one shared student/moderator sign-in. The server reads the role from the stored account.
- One OWNER per college and up to five active MODERATOR accounts per college.
- Per-college students, academic records, permissions, attendance, routines, holidays, reports, and audit entries.
- Individual student access codes, stored as password hashes, with owner rotation and revocation.
- Session cookies, CSRF and origin checks, password hashing, and sign-in/registration throttling.
- Attendance entry and correction, academic sessions, student import/export, timetable versions, holiday overrides, and read-only student dashboards.

## Existing database and migration

`wrangler.toml` is already configured with the existing D1 database `college-attendance`, binding `DB`, and the existing database ID. Keep that configuration. Do not run `wrangler d1 create` or replace the database.

The remote database schema was inspected read-only. Migration `0001_initial.sql` is already applied. `0002_college_tenants.sql` adds a `colleges` table and college IDs to existing records, then assigns existing records to an “Existing College” workspace. It does not delete records or tables. The old global OWNER and active academic-session indexes are replaced with per-college indexes. The subject uniqueness index is also college-scoped.

The original schema has some inline global uniqueness constraints that cannot be changed without rebuilding tables. To honor the requirement not to drop or rebuild existing tables, usernames, department names, academic-session names, roll numbers, and registration numbers remain globally unique. This can prevent two colleges from reusing those exact values, even though their records and API access are isolated by college. This is a known limitation of the current safe migration.

Before applying a production migration, check the D1 storage version and recovery point. From this project folder, run:

```powershell
npx wrangler d1 info college-attendance
npx wrangler d1 time-travel info college-attendance
npm run db:remote
```

For a database whose `version` is `production`, D1 Time Travel is enabled automatically; record the bookmark printed by the second command before proceeding. Wrangler captures a backup after applying migrations and rolls back a migration that fails. If `version` is `alpha`, follow Cloudflare's legacy D1 backup process instead; Time Travel is not available for that storage version. Do not paste the migration into the D1 console, because Wrangler tracks migration history. This project has not applied migration `0002` to the remote database.

If the migration succeeds but must be rolled back, stop application writes and restore the production database to the recorded pre-migration bookmark:

```powershell
npx wrangler d1 time-travel restore college-attendance --bookmark=<PRE_MIGRATION_BOOKMARK>
```

This restore overwrites the database in place. It also removes writes made after that bookmark, so use it only after confirming the impact. Wrangler prints a bookmark for the state immediately before restore, which can be used to undo the restore if needed. D1 Time Travel retention is limited (7 days on Workers Free, 30 days on Workers Paid); keep a separate export for longer retention.

Apply the migration before deploying the updated Worker. A GitHub-connected Worker deploys code, but the D1 migration remains a separate step unless the Cloudflare build is explicitly configured to run it.

## Local development

1. Install a current Node.js LTS release and run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and use a long random `OWNER_RECOVERY_KEY` if you need recovery for the existing legacy OWNER.
3. Run `npm run db:local`, then `npm run dev`.
4. Open the address Wrangler prints. Register a college in the sign-in page. The first OWNER recovery code is shown once after registration; save it securely.

New colleges store their own recovery-code hash in D1. `OWNER_RECOVERY_KEY` is retained only as a recovery fallback for the original legacy OWNER. The old first-owner setup endpoint and setup secret are no longer used.

## Sign-in and data isolation

- Owners sign in from **OWNER SIGN IN**. A new college uses **REGISTER COLLEGE**.
- Students and moderators use **STUDENT / MODERATOR**. Students enter their individual access code; moderators leave that field empty.
- The UI does not send a role claim. The Worker authenticates the account and selects the role from D1.
- Authenticated API requests are scoped from the college ID stored with the user and session. The database also rejects cross-college references when records are created.
- The migrated legacy workspace is named “Existing College” until its OWNER changes the college name under the Security section.

## Deployment

The Wrangler project name is `edunest`, the D1 binding is `DB`, and the configured timezone is `Asia/Kolkata`. Connect the repository to Cloudflare Workers Builds if automatic GitHub deployment is desired. Apply the D1 migration once before the updated Worker handles production traffic. Use the existing database and binding.

The supplied project folder has no `.git` metadata, so GitHub connection status cannot be determined from this folder. The original `Attendance Sheet - College Edition.html` is retained; the served application is in `public/`.

## Security notes

- Never commit `.dev.vars`, real student data, or recovery codes.
- The production database and deployment were not modified as part of this code update.
- The pasted development prompt ended mid-sentence after “Never ask me to delete tab”; requirements after that point were not available.
