# DCC Bar Schedule

Volunteer scheduling and administration for Dunany Country Club, built with
Next.js, Auth.js, Prisma, and PostgreSQL. Inventory is maintained in a separate
repository.

## Local setup

Use Node.js 20.9 or newer. The application lives in `apps/web`.

1. Copy `apps/web/.env.example` to `apps/web/.env.local` and replace the placeholders.
2. From `apps/web`, run `npm ci`.
3. Apply migrations with `npm run db:deploy` against your intended database.
4. Run `npm run dev` and open http://localhost:3015.

Google and Yahoo OAuth require provider credentials and callback URLs for your
deployment. Approved members can continue with email alone; administrator
accounts require Google or Yahoo authentication. `BOOTSTRAP_ADMIN_EMAILS` is
used only by the explicit `npm run db:bootstrap-admin` command.

Gmail delivery uses `GMAIL_USER` and `GMAIL_APP_PASSWORD`. The notification cron
endpoint requires `CRON_SECRET`. Never commit real configuration or data exports.
The Docker Compose password is for local development only.

## Verification

From `apps/web`, run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Prisma generation and builds require `DATABASE_URL` configuration. Local checks
with a placeholder URL do not verify production database connectivity or OAuth.

## Vercel

Set the project Root Directory to `apps/web` and configure real environment
variables in Vercel. Keep the existing database and migration history when
reconnecting an existing deployment. Do not bootstrap or migrate a production
database merely to test a build.
