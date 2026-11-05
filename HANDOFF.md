# AccountingSim handoff

Updated 2026-11-05 by Codex. Repository: https://github.com/AlMamoonX/AccountingSim, branch `main`. Local checkout: `C:\Projects\ACCsim`.

## Current work and owner decisions

The exercise app and company simulation are implemented. The owner asked to continue the prior handoff, then explicitly requested deployment to **https://accounting.tryzarqa.com** on the existing tryzarqa VPS, reusing existing DeepSeek, Resend and SSH configuration. The owner added the DNS A record; both public DNS and the VPS resolve it to `173.249.40.122`.

The owner clarified that **student tasks can differ every month according to the teacher's AI request**, including changing upcoming coursework while a simulation is running. This is now implemented:

- A simulation's optional `monthWork` contains separate monthly briefs and parts. Existing simulations keep working through their shared `monthParts` fallback.
- The creation prompt asks for month-specific coursework. Review shows the monthly curriculum; Edit can change each month's worksheets or their shared defaults.
- The control room's **Plan the next month with AI** selects an unopened month, generates a draft, shows Student view/Answer key, then applies it to that class only.
- Run-specific plans are stored in `sim_runs.month_work`; they do not mutate the published simulation or another class's run.
- The active month and all earlier months are locked. Apply rechecks that boundary under a database row lock, including a draft generated before the teacher opened its target month.
- Business decisions, events, company state and business scoring remain the same. The live AI control changes coursework using existing model formulas; it does not invent a new business model midway through a class.
- Student books, grading, reports, skipped-month mark maxima and Excel standings use the selected monthly plan.

The owner then said **"just deploy dont manually check for now"**. Stop further manual walkthroughs; finish the production build, deployment and basic availability check. The unfinished student walkthrough is deliberately deferred, not claimed as passed.

## Changes and validation

- Fixed deadline expiry: the first visit/export after expiry settles unfinished opened months and fixes the run's end time at its deadline. Unopened months do not count.
- Fixed late joining: naming a company after month one settles earlier months so the student can start the current one.
- Unsubmitted books with locked decisions retain those decisions, receive zero accounting marks and count as auto-played.
- Local unsent drafts are scoped by player and month; one student's or a skipped month's draft no longer leaks into another worksheet.
- Added migration `drizzle/0002_thick_komodo.sql` and its generated metadata.
- `npm test`: **33 tests pass**, including five real embedded-Postgres integration tests for deadlines, late joining, skipped months, run isolation, future-only changes and unchanged historical marks.
- `npm run typecheck`: **passes**.
- Real DeepSeek generation: bakery in Nizwa, four months, inventory and a loan; generated simulation passed `analyzeSim` in the review screen. Local sim ID `60e87dd8-2e51-4430-8bdf-fd7cab075bd8`.
- Real live DeepSeek change: February's journals replaced with an inventory schedule and net-income question. Student preview and answer key worked, and **Apply to February** succeeded. Local run `1ea990ea-1cb2-4cce-b074-6e82a9818039`.
- Desktop (1440) and phone (390) draft captures checked; inherited Karak Pop styling preserved. Mechanical UI detector returned `[]`. A limited finish review found Apply errors could appear above a long preview; they now appear beside Apply. Further manual checking was stopped by owner request.
- The original latest commit `28136b0` says auto-play, end-run and Excel were browser-verified by the preceding agent; those checks were still listed as unfinished in the old handoff. This session has automated persistence coverage but has not repeated the complete student/final/Excel walkthrough.
- `npm run build`: **passes**, including production compilation, type validation and all route generation.
- VPS Docker production build: **passes**. Application image `accounting-sim:e2722ef`, application code commit `e2722ef1e0168de2ef165440fc0e44407ac4108e`.
- **Deployed 2026-11-05, approximately 23:52 Muscat time** at https://accounting.tryzarqa.com. App and backup containers are running; database is healthy. Let's Encrypt obtained the certificate, and a normal TLS-verified request from the VPS to `/login` returned **HTTPS 200**.
- Deployment uncovered an old bind-mounted proxy config inode: reloading `/etc/caddy/Caddyfile` returned "config is unchanged" despite host-file changes. `ensure-caddy.py` now copies the actual current host config to a temporary container path before validation/reload; existing apps need no restart. Host configuration still contains the route for future proxy starts. This deploy-helper fix is committed after the app image commit.

## Deployment

Use [deploy/README.md](deploy/README.md). SSH identity is `C:\Users\abdul\.ssh\zarqa_vps`, account `deploy@173.249.40.122`. Existing apps share this VPS; build/start only the `accounting-sim` Compose project.

- Location: `/home/deploy/accountingsim`.
- Shared network `zarqa_default`, unique app alias `accounting-sim`.
- Existing proxy: `zarqa-caddy-1`; mounted config `/opt/zarqa/deploy/Caddyfile`.
- `deploy/docker-compose.shared.yml` disables this project's dedicated Caddy and joins only the app to the existing proxy network.
- `deploy/bootstrap-env.py` creates a private `.env`, generating new session/database secrets and copying only needed DeepSeek/Resend settings from the server's existing apps. It never prints keys and refuses to replace an existing `.env`.
- Sender: `AccountingSim <noreply@tryzarqa.com>`. Production has no `0000` bypass.
- `deploy/ensure-caddy.py` backs up and preserves existing routes, adds only the marked AccountingSim block, validates/reloads, and rolls back on failure. Other apps' future deployments must preserve this block or rerun the script.
- New containers: `accounting-sim-app-1`, `accounting-sim-db-1`, `accounting-sim-backup-1`. Public web ports remain owned by the existing proxy; AccountingSim's database has no host port.
- Post-deploy access issue: the owner's computer's normal DNS lookup returns NXDOMAIN while direct Cloudflare/Google DNS resolve the primary host correctly; clearing Windows DNS cache did not fix the upstream cached answer. Origin and VPS HTTPS requests still return 200. Added `https://accounting.173-249-40-122.sslip.io` as an alternate hostname for the same app, since the normal local resolver already resolves it. **Fallback HTTPS 200 verified from both the owner's computer and VPS**, with normal certificate checks. Primary domain remains unchanged; sessions are per host. No DNS adapter settings or hosts file were changed.
- Database and uploads have independent named volumes. Nightly backups go into the deployment's `backups` directory.

No secrets are committed. `.env.local` is ignored and contains the reused DeepSeek setting for local development; production Resend is configured on the VPS only. Never print environment-file contents or keys.

## Development notes

`npm ci`, then `npm run dev`. Local allowed emails can use `0000` only in development. Teacher allowlist is in `.env.example`; students use `@student.gutech.edu.om`.

Restart the dev server after adding migrations. Stop it before `npm run build` because both use `.next`. Forms showing AI progress use `onSubmit` rather than React form `action=` so loading states paint immediately.

The simulation follows Decide → event → teacher-directed tasks → Results, with one company per student and company-name-only student leaderboard. Correct closing books always feed the next month. Default weighting is 70% accounting, configurable by the teacher. Final results use `/s/sims/[runId]`; there is no separate `/final` route.

`README.md` and `pages.md` document all simulation routes and the live coursework flow. Dependency upgrades were outside this feature/deploy change; the existing lockfile's audit findings remain to be reviewed separately.

## Deferred work

- When the owner requests testing again: complete the browser student flow with a changed month, skipped month, final results and Excel download.
- Consider broader live simulation editing only if requested; current live AI changes coursework while preserving the business model.
