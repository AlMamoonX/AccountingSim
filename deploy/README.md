# Shared tryzarqa VPS

AccountingSim uses its own Compose project, database and upload volume. The existing `zarqa-caddy-1` proxy owns ports 80/443. Only AccountingSim's app joins its `zarqa_default` network under the unique name `accounting-sim`.

## First deployment

1. Set the DNS A record `accounting.tryzarqa.com` to `173.249.40.122`.
2. Copy this repository, excluding `.git`, `node_modules`, `.next`, `data`, and all environment files, to `/home/deploy/accountingsim`.
3. Run `python3 deploy/bootstrap-env.py` there. This creates a private `.env` with new session/database secrets, the existing DriveAlt DeepSeek key, and the existing Resend key. It prints no secret values and refuses to replace an existing file. Mail comes from `AccountingSim <noreply@tryzarqa.com>`. Teacher allowlist comes from the project's existing defaults; edit `.env` explicitly to change it.
4. Build and start only AccountingSim:

```sh
cd /home/deploy/accountingsim
docker compose -p accounting-sim -f docker-compose.yml -f deploy/docker-compose.shared.yml up -d --build
python3 deploy/ensure-caddy.py
curl --fail https://accounting.tryzarqa.com/login
```

`ensure-caddy.py` backs up the shared Caddyfile, adds/replaces only the marked AccountingSim block, validates and reloads Caddy, and restores the previous contents if validation/reload fails. Other routes are retained. No separate Caddy container is started. If another app replaces the shared Caddyfile, retain this block in its source configuration or re-run this script.

## Updates and checks

Copy the new source into the same directory, preserving `.env` and `backups`. Re-run the Compose command and Caddy script above. Migrations apply when the app first opens the database. Local development's `0000` shortcut is disabled in production.

```sh
docker compose -p accounting-sim -f docker-compose.yml -f deploy/docker-compose.shared.yml ps
docker compose -p accounting-sim -f docker-compose.yml -f deploy/docker-compose.shared.yml logs --tail 60 app
docker compose -p accounting-sim -f docker-compose.yml -f deploy/docker-compose.shared.yml exec -T db pg_isready -U accsim -d accsim
```

The backup service writes compressed database dumps into `./backups` daily, retaining 14 days. Keep a separate off-server backup for disaster recovery. To stop only AccountingSim, use the same Compose arguments followed by `stop`; do not remove its volumes.
