# Deployment, operations and backups

## Architecture

```
Internet -> Cloudflare (CDN / WAF / TLS / Turnstile)
              -> Next.js app (stateless, run N copies)
                    |-- PostgreSQL (managed, pooled)
                    |-- Redis (rate limits, OTP throttling)
                    |-- Private object storage (S3 or Cloudflare R2)
              -> Worker (npm run worker)  -> email provider
```

The app is stateless: sessions live in PostgreSQL, rate limits in Redis, files in object storage, jobs in the `background_jobs` table. You can add app servers without sharing anything on disk.

## Environment variables

Copy `.env.example`. The app **refuses to start in production** if these are wrong (this is deliberate):

- `STORAGE_DRIVER` must be `s3` (S3 or R2), not `local`.
- `SESSION_SECRET` must be a long random value (`openssl rand -hex 32`).
- `BREVO_API_KEY` must be set: transactional email (including OTP codes) is delivered via Brevo.
- `REDIS_URL` must be set: the rate limiter **fails closed** without it.

Also set `APP_URL`, `COMPANY_NAME`, `COMPANY_DOMAIN`, `DATABASE_URL` (pooled) and `DIRECT_URL` (for migrations), `JOB_RUNNER_SECRET`, `SENTRY_DSN`, and, if you use Turnstile, `TURNSTILE_ENABLED=true` with both keys.

UPI ID, QR and the fee are **not** environment-only: super admins edit them at `/admin/settings`. The env values are only first-run defaults.

## First deployment

1. Provision PostgreSQL, Redis and a **private** bucket (no public access, no website hosting).
2. `npm ci && npm run db:generate && npm run db:deploy` (use `db:migrate` in development to create migrations first).
3. `SEED_SUPER_ADMIN_*` set, then `npm run db:seed` once. Never run `db:seed:demo`.
4. `npm run build && npm start`, plus `npm run worker` as a separate process (or call the cron endpoint below).
5. Sign in at `/admin/login`, change the seeded password at `/admin/account`, then configure `/admin/settings` (fee, UPI ID, QR, certificate disclaimer) and publish an internship.

## Background jobs

Emails, certificate PDFs, GitHub repository checks and file scans run as jobs. Options (use at least one):

- **Worker process:** `npm run worker` (recommended). Safe to run several copies.
- **Cron:** `curl -X POST -H "Authorization: Bearer $JOB_RUNNER_SECRET" https://your-host/api/internal/jobs` every minute.
- **Retention (daily):** run `npm run retention` (or call the same internal endpoint) on a daily schedule, e.g. `0 0 * * *`. It removes email logs after 30 days, notifications 90 days, sessions and OTP 7 and 1 days, background jobs 7 days and security events 180 days. `audit_logs` are intentionally skipped as an immutable security trail.

The app also kicks the queue after each request that enqueues work. Failed jobs retry with exponential backoff (30s, 2m, 8m, up to 1h) and show up under *Security -> failed jobs* once they exhaust their attempts. Jobs stuck "running" after a crash are re-queued automatically.

## Cloudflare

- Proxy the domain, SSL mode **Full (strict)**, enable "Always use HTTPS" and HSTS.
- Add a WAF rate-limit rule on `/api/auth/*` and `/api/contact`; the app also limits per IP/email in Redis.
- Behind Cloudflare, make sure your reverse proxy passes the real client IP. The app reads `x-forwarded-for` / `cf-connecting-ip`; **only expose the app through Cloudflare** so those headers cannot be forged by clients.
- Optionally enable Turnstile (`TURNSTILE_ENABLED=true`) for contact and sign-up.

## Email

Transactional email (including OTP codes) is delivered via **Brevo** (formerly Sendinblue) over its HTTP API. Set `BREVO_API_KEY` (your Brevo v3 key) and `EMAIL_FROM` (a verified sender in Brevo). Set up SPF, DKIM and DMARC for the sending domain in Brevo or OTP emails will land in spam. Free tier is ~300 emails/day. Templates are editable rows in `email_templates`.

## Object storage (S3 / R2)

Keep the bucket private. The app serves files only through `/api/files/<id>`, which checks ownership or permission and then redirects to a signed URL that expires in 2 minutes. Grant the app's key only `Get/Put/DeleteObject` on that bucket.

## Backups and restore

**Database (PostgreSQL)**

- Enable the provider's automated daily backups and **point-in-time recovery**; keep 30 days.
- Add a weekly logical dump kept off-provider: `pg_dump --format=custom --no-owner "$DIRECT_URL" > backup-$(date +%F).dump`, encrypted, retained 90 days.
- **Restore drill (do this before launch, then quarterly):**
  1. `createdb restore_test`
  2. `pg_restore --no-owner --dbname=restore_test backup.dump`
  3. Point a staging app at it and check: an admin can sign in, `select count(*) from certificates` matches production, and one certificate verifies at `/verify-certificate/<id>`.
  4. Record the date and the time it took in your runbook.

**Files:** enable bucket versioning plus a lifecycle rule (keep non-current versions 30 days). Certificate PDFs can always be regenerated from the database, but payment screenshots cannot, so back the bucket up.

**Redis** holds only rate-limit counters and is safe to lose.

> A backup you have never restored is not a backup. This repository documents the procedure; **it has not been exercised against your infrastructure.**

## Monitoring

`SENTRY_DSN` enables error reporting (`src/lib/monitoring.ts`); personal data and secrets are not sent. `/api/health` returns component status for uptime checks (503 when the database or Redis is down). Review **Security** in the admin panel for failed logins, authorisation failures, repeated payment submissions, malicious upload attempts and rate-limit hits, and alert on spikes of `SUSPICIOUS_ADMIN_LOGIN` and `MALICIOUS_FILE_ATTEMPT`.

## Scaling

Stateless app servers behind the CDN; use the pooled `DATABASE_URL` (PgBouncer or the provider's pooler). All admin tables use server-side pagination (20/50/100), exports stream in batches, and the dashboard uses aggregate queries. Add read replicas or move the queue to a dedicated broker only if the `background_jobs` table becomes a bottleneck.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Invalid environment configuration" at boot | A production-unsafe value (console email, local storage, short secret). The message names the variable. |
| 429 on every request | Redis unreachable in production (fails closed), or a limit set too low. |
| Certificate stuck "being generated" | The worker or cron is not running. Check `background_jobs` for `CERTIFICATE_PDF` rows and their `last_error`. |
| Admin cannot sign in | Wrong password (locks 15 min after 5 failures) or the emailed code did not arrive (check DKIM/SPF, `email_logs`). |
| Students never receive codes | Email provider keys or sending-domain DNS. In development use `npm run dev:otp`. |
| Student sees no QR code | No QR uploaded in `/admin/settings`, or the student is not certificate-eligible yet. |
