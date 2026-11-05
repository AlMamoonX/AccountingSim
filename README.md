# AccountingSim

Real-business accounting practice for **CS2 145 Accounting & Controlling** (GUtech).

The doctor describes an exercise in plain words ("a car-wash in Muscat, 10 transactions, include an owner withdrawal, then net income"). An AI (DeepSeek) writes the business story, the transactions, the worksheets and the answer key, using the uploaded lecture slides as its reference. The doctor checks and edits it, then gives it to a class. Students solve it in the browser and are marked automatically, each with their own numbers if the doctor wants.

- **What each page does:** [pages.md](pages.md)
- **Design (Karak Pop):** [docs/design-handoff.md](docs/design-handoff.md)

## How it works (no accounting is hard-coded)

The app only knows generic building blocks:

| Block | Students see | Marking |
|---|---|---|
| **Fill-in table** (`grid`) | Columns, groups and rows chosen by the AI: transaction analysis, financial statements, schedules… | 1 mark per non-empty answer box and per totals box; a number in a box that should be empty costs 1 mark |
| **Journal entries** (`journal`) | Pick account, debit or credit, amount | 1 mark per expected line, any order |
| **Number questions** (`numeric`) | One box per question | 1 mark each, optional tolerance |

Every answer is a **formula** over named amounts (`-(rent + wages)`, `A.group.assets`), and every exercise carries **checks** (`group.assets == group.liabilities + group.equity`). The server recomputes everything, sends failures back to the AI to fix (twice), and shows anything left to the doctor. Per-student numbers are random amounts within each amount's min/max that still pass every check. No extra AI calls are needed.

Answer keys never reach the browser before results are released. Practice mode shows marks after hand-in; graded mode shows them after the deadline.

Code map:

```
src/lib/spec/     exercise format (schema.ts), safe formula language (expr.ts), engine + marking (engine.ts), tests
src/lib/ai/       DeepSeek client, system prompt, generate / revise with automatic repair
src/lib/library.ts  lecture upload, PDF/PowerPoint text, Postgres full-text search
src/lib/auth.ts   6-digit email codes (Resend), sessions, doctor allowlist
src/app/t/...     doctor pages        src/app/s/...  student pages
src/db/           Drizzle schema + database connection (migrations in ./drizzle run automatically)
```

## Run it on your own computer

Needs Node.js 22 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Put your `DEEPSEEK_API_KEY` in `.env.local`. Leave `DATABASE_URL` and `RESEND_API_KEY` empty: a built-in database is stored in `./data`, and sign-in codes are printed in the terminal.

```bash
npm run dev
```

Open http://localhost:3000. In local test mode you can sign in with any allowed email and the code **0000**. That shortcut only exists in `npm run dev`, never in the production build. The first start takes a few seconds while the database is created.

On the Exercises page, **Add the Karak sample** loads the Lecture 5 exercise, so you can try everything without the AI.

```bash
npm test
```

## Put it on the VPS (Docker)

Needs a Linux server with Docker, and a domain (e.g. `accsim.example.com`) whose DNS A record points at the server.

1. Copy the project to the server.
2. `cp .env.example .env` and fill in: `APP_URL`, `DOMAIN`, `SESSION_SECRET` (`openssl rand -hex 32`), `POSTGRES_PASSWORD`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `MAIL_FROM`.
3. In [Resend](https://resend.com), add and verify your domain (DNS records), and use an address on it in `MAIL_FROM`. Until the domain is verified, Resend only delivers to your own account's address, so students won't get codes.
4. Start everything:

```bash
docker compose up -d --build
```

Caddy gets the HTTPS certificate automatically. The database lives in a Docker volume; uploaded lectures in another. A backup of the database is written to `./backups` every night and kept for 14 days.

Update after pulling new code:

```bash
docker compose up -d --build app
```

Restore a backup:

```bash
gunzip -c backups/accsim-2026-11-05.sql.gz | docker compose exec -T db psql -U accsim accsim
```

## Settings

All settings are in [.env.example](.env.example) with comments. Doctor accounts are the emails in `TEACHER_EMAILS`. They all share the same classes, lectures and exercises. Students are anyone with an email on `STUDENT_EMAIL_DOMAIN`.

To change the database tables: edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in `./drizzle`. It is applied automatically on the next start.

## Using a different AI

`DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` and `DEEPSEEK_API_KEY` work with any OpenAI-compatible API, so OpenAI itself can be used by pointing them at it. Set `AI_VISION=true` only for a model that reads images; the doctor can then upload screenshots as samples.
