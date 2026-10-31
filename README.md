# Edutrack

Edutrack is a college attendance and academic management app served by a Cloudflare Worker, with Cloudflare D1 for its existing database. The visible product name is Edutrack; the Worker project remains `edunest`.

## Included in this update

- Responsive visual refresh for the existing sign-in and application shell.
- College name shown below Edutrack after the authenticated user is loaded.
- Password visibility control.
- Monday–Sunday routine selector using the existing routine API and role permissions.
- PWA manifest, install guidance, app icons, service worker, and a static offline page. Only public assets are cached; API requests and authenticated data are never cached.

Session-start notifications are not included. The project has no notification delivery or read-state infrastructure. Implementing notifications for all college users requires new server-side behavior and persistence, so that work needs approval before it is added.

## Existing database

`wrangler.toml` retains the current Worker name, D1 database ID, `DB` binding, assets binding, and timezone. This UI update adds no migration and does not change the database schema or contents. Keep using the existing D1 database; do not create or replace it.

## Local development

1. Install Node.js and run `npm install` from this project directory. In PowerShell, `npm.cmd install` avoids the PowerShell script-policy error for `npm.ps1`.
2. If local secrets are needed, copy `.dev.vars.example` to `.dev.vars` and set a long random recovery key. Do not commit `.dev.vars`.
3. Run `npm run dev` and open the local address Wrangler prints.

The local database commands in `package.json` are for local development. This UI update does not require running a remote migration.

## GitHub and Cloudflare deployment

Upload the contents of this ZIP to the root of the existing GitHub repository, keeping the folder layout (especially `public/`, `src/`, and `migrations/`). A connected Cloudflare deployment can publish the updated Worker and public assets from that repository. Keep `.dev.vars` and real student data out of GitHub; `.dev.vars.example` is only a template.

The project is configured to serve `public/` as static assets. PWA installation requires the site to be served over HTTPS. After deployment, open the website in a supported browser and use **Install** or the browser's **Add to Home Screen** option.

## Security

This update does not change authentication, authorization, tenant isolation, database IDs, migrations, or API business rules. The new service worker bypasses `/api` and never stores private responses for offline use.
