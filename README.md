# Edutrack

Edutrack is a Cloudflare Workers college management app backed by Cloudflare D1. It keeps the existing account, attendance, academic, and routine tables and adds isolated teacher, notice, QR-login, and Web Push features.

## Workspaces and features

- Role based workspaces for owners, teachers, moderators, and students. Teacher identity is additive in `teacher_accounts`; existing `users.role` values and moderator permissions remain intact.
- Student, course, subject, attendance, classroom, history, export, and audit workflows backed by D1.
- Optional student registration numbers. Internal student IDs remain the record keys.
- Single-use student QR login codes stored as hashes, with a five minute expiry, explicit sign-in action, and rate-limited verification.
- Weekly horizontal timetable with chronological periods, class details, and visually distinct recess periods.
- Text-only college notices with audience, expiry, and pinned status, stored in the existing D1 database.
- Web Push subscriptions per user and device, classroom/notice push events, invalid subscription cleanup, and retry queue.
- Installable PWA shell. The service worker caches only public shell assets; API responses and private student data are network-only.

## Database safety

Migrations `0003_teacher_notices_qr_push.sql` and `0004_teacher_access_code_guard.sql` have already been applied to production. Do not edit or rerun them. Migration `0005_branch_aware_academics.sql` adds a course-to-branches relationship and branch scope to subjects and routines. It preserves existing student, subject, routine, enrollment, and attendance records. Existing combined branch names remain as one branch row; the migration does not guess how to split or remap them. The existing registration number column is nullable and unique. Migrations are not applied automatically by deployment.

Apply migration 0005 to the local D1 emulator when setting up a local copy. For production, back up D1 and apply only the pending migration after reviewing its SQL:

```sh
npx wrangler d1 migrations apply college-attendance --remote
```

To represent a combined legacy branch as separate choices, first confirm the real mapping with the college administrator. Create each branch as a separate row under its department, then use the course's **Branches** action to assign the confirmed branches. Existing student profile assignments stay unchanged; old subjects and routines remain unassigned/shared until an administrator confirms their scope and updates them. Do not delete the legacy combined branch while student profiles still reference it.

Keep the current database name and ID in `wrangler.toml`. Do not run `npm run db:local` against production. That script is for a local Wrangler D1 database only.

## Local setup

1. Install Node.js and run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill in local-only values. Never commit `.dev.vars`.
3. Apply migrations to the local D1 emulator with `npm run db:local`.
4. Start the app with `npm run dev`.
5. Run `npm run check` for JavaScript syntax checks.

This no-R2 configuration does not require an object-storage bucket or R2 subscription. Notice titles and text are stored in the existing D1 database.

## Cloudflare setup

### Free-plan usage

This project can run on Cloudflare's Workers Free plan while usage stays within the current limits. The published limits include 100,000 Worker requests per day and 10 ms CPU time per invocation; D1 includes 5 million rows read per day, 100,000 rows written per day, and 5 GB total storage. Workers Builds includes 3,000 build minutes per month. Exceeding free D1 daily limits causes database queries to fail until the daily reset. Review the current limits before production use:

- [Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

### Web Push keys

Generate a VAPID pair locally:

```sh
npm run vapid:generate
```

Set both generated values as Worker secrets (do not commit them):

```sh
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

The `VAPID_SUBJECT` value in `wrangler.toml` should be changed to a monitored `mailto:` address for the college. For local testing, put the generated public/private keys and a contact address in `.dev.vars`. The public key is returned to signed-in clients by the Worker; the private key stays server-side.

Users must grant notification permission and enable push separately on each device. Push requires HTTPS and a browser that supports the Push API and service workers. iOS support requires an installed home-screen web app on a compatible iOS version. Unsupported browsers keep in-app updates while Edutrack is open. Delivery to real devices must be verified after deployment with an actual subscription; local syntax/build checks do not prove a push provider delivered a notification.

### Production deployment

After migration 0005 is applied to production, setting VAPID values, and checking the production `VAPID_SUBJECT`, deploy through the existing GitHub/Cloudflare workflow or run `npm run deploy`. No R2 bucket is required. The Worker cron schedule retries pending push deliveries every five minutes. Deployment does not apply D1 migrations automatically.

## QR login behavior

Owners and teachers can issue a QR code from student management. A code contains only a cryptographically random one-time token, whose SHA-256 hash is stored in D1. It expires after five minutes, is consumed once, and is invalidated when revoked or replaced. Scanning only fills the sign-in code; the user must explicitly continue. QR management is not available to moderators or students.

## Private app indexing and PWA

The application is deliberately marked `noindex,nofollow`; `robots.txt` excludes API routes. There are no public college pages for a sitemap or canonical listing. The page has a title, description, Open Graph metadata, manifest, icons, and service worker. Keep private dashboards and API data out of public caches.

## GitHub upload

Include source files, `public/`, `migrations/`, `scripts/`, `package.json`, `package-lock.json`, `.dev.vars.example`, `.gitignore`, `README.md`, and `wrangler.toml`. Do not upload `.dev.vars`, `.wrangler/`, `node_modules/`, `.git/`, or local database exports. Preserve the existing Cloudflare project and D1 database identifiers.

## Validation

`npm run check` runs `node --check` on the Worker, browser JavaScript, and smoke tests. `npm test` covers request/form loading behavior, error handling, VAPID signing, Web Push payload framing, and malformed subscription handling with stubbed requests. After starting a local Worker and applying local migrations, `npm run test:local` exercises role login/denial, optional registration numbers, multiple branches per course, branch-scoped subject uniqueness and enrollment, routine/recess storage, classroom start/end, attendance history/calculations, and QR issue/use/replay/revoke. It creates a uniquely named QA college and leaves those test records in local D1; it refuses any non-local URL. `npm run deploy -- --dry-run` builds the Worker/assets without publishing. Production login, provider delivery, and mobile camera behavior still require testing with existing production accounts and real devices after the reviewed deployment steps. A successful crypto test is not proof of delivery to a real notification service.
