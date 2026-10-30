# Edutrack

Edutrack is a mobile-first college attendance and academic management app built with vanilla HTML, CSS, and JavaScript, a Cloudflare Worker API, and Cloudflare D1. The original `Attendance Sheet - College Edition.html` is preserved in the project; the new site is served from `public/`.

## What is included

- Separate OWNER, MODERATOR, and STUDENT sign-in and dashboards.
- Server-side roles, per-moderator global or subject permissions, session expiry and revocation, CSRF and same-origin checks, password hashing, hashed cookie sessions, and a database-backed login throttle.
- Private student sign-in with username, password, and a one-time-issued individual access code. Codes are hashed in D1 and displayed only when created or rotated.
- Owner tools for student CSV import/export, one-time access-code issue/revocation, moderator management, and attendance report export. The import template is downloadable from the Students page.
- Student profile, enrollment, subject, attendance, routine, holiday, reporting, and audit-log database tables with foreign keys and indexes.
- Academic session creation and editing; creating a session makes it active and archives the previous active session.
- A partial unique index and triggers to protect the single OWNER and limit active moderators to five.
- Owner recovery using a separately stored recovery secret.
- Student dashboards that only request their own academic records.
- Attendance entry that requires a mark for every enrolled student and blocks holidays unless the OWNER confirms and audits an override.
- Timetable versions with effective dates and period-overlap checks.
- Responsive light/dark styling based on the supplied attendance sheet.

The pasted development prompt ends partway through the Android/iPhone/PC checklist. The implementation covers the complete requirements visible before that cutoff. This project has not been deployed to a Cloudflare account and has no Cloudflare D1 database ID yet.

## Before you start

Install a current Node.js LTS release and create a Cloudflare account. Create a GitHub repository for this folder if you want automatic deployments. Keep `.dev.vars`, passwords, setup/recovery secrets, and account credentials out of GitHub.

## Local setup on Windows

1. Open PowerShell in this project folder and install Wrangler:

   ```powershell
   npm install
   ```

2. Create a local secrets file. Copy `.dev.vars.example` to `.dev.vars` and replace both example values with long, unique random secrets. The `.dev.vars` file is ignored by Git.

3. Apply the schema to the local D1 database and start the app:

   ```powershell
   npm run db:local
   npm run dev
   ```

4. Open the local address printed by Wrangler. The first-time owner form appears only while the OWNER table is empty and `OWNER_SETUP_KEY` is configured. Use the matching value from `.dev.vars`. Create a long owner password and store the `OWNER_RECOVERY_KEY` somewhere offline.

5. After setup, remove `OWNER_SETUP_KEY` from `.dev.vars` so the setup form and endpoint are disabled. Keep the recovery secret in a secure offline location.

## Create the production D1 database

Run these commands after logging into Wrangler:

```powershell
npx wrangler login
npx wrangler d1 create college-attendance
```

Copy the `database_id` Wrangler returns into `wrangler.toml`, replacing `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`. The Worker binding is named `DB`; the D1 database is named `college-attendance`.

Apply the migration to Cloudflare D1:

```powershell
npm run db:remote
```

Set production secrets through Wrangler. Use different values for the first-owner setup and recovery secrets:

```powershell
npx wrangler secret put OWNER_SETUP_KEY
npx wrangler secret put OWNER_RECOVERY_KEY
```

Deploy the Worker:

```powershell
npm run deploy
```

Open the deployed site, create the first OWNER, then disable first-time setup:

```powershell
npx wrangler secret delete OWNER_SETUP_KEY
```

Keep `OWNER_RECOVERY_KEY` configured. To recover the owner account, use **Owner account recovery** on the sign-in page with that secret and a new password. Recovery revokes existing owner sessions. Rotate the recovery secret if it is exposed.

## Automatic deployment from GitHub

Cloudflare Workers Builds supports connecting a GitHub repository and deploying on pushes. In the Cloudflare dashboard, create or open the `edutrack` Worker, connect this GitHub repository, and set the repository root to this project. The Wrangler `name` must match the Worker name. Set the production secrets and D1 binding in the Cloudflare dashboard or keep the binding in `wrangler.toml`; deploy the D1 migration separately before the first app use. The default Wrangler deploy command is sufficient; the project also supplies `npm run deploy`.

Cloudflare Workers can serve the `public/` files and run the API Worker on every request; the Worker forwards static requests through the `ASSETS` binding. D1 migrations are tracked in `migrations/0001_initial.sql`.

## Current API areas

- `/api/login`, `/api/logout`, `/api/me`, `/api/setup/owner`, `/api/setup/recover-owner`
- `/api/students`, `/api/moderators`, `/api/academics`, `/api/departments`, `/api/branches`, `/api/courses`, `/api/subjects`, `/api/sessions`, `/api/enrollments`
- `/api/attendance/*`, `/api/routines*`, `/api/holidays*`, `/api/reports`, `/api/audit`

All D1 SQL values are bound parameters. Client-supplied role and student IDs are not used to authorize a student data request; the student identity comes from the authenticated session.

## Important deployment notes

- Do not commit actual D1 IDs from other environments, Cloudflare secrets, or real student data.
- Do not reuse the example secret values. Set random secrets with Cloudflare or generate them locally.
- The initial OWNER recovery secret is a high-value credential; keep it in an approved password manager or offline vault.
- Before handling real student data, review the implementation with your institution’s security/privacy requirements and run deployment-level checks in your Cloudflare account. This repository alone cannot prove that a live deployment is secure.
- The initial pasted prompt was truncated at its final mobile-support bullet, so any requirements after the visible text were unavailable.

## References

- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1 migrations and Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare Workers Builds with GitHub](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
