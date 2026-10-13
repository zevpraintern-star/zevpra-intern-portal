# Security audit report

**Scope:** the full application in this repository: public site, student portal, admin panel, API routes, background jobs.
**Method:** code review of every mutating path, 61 automated tests (unit + real PostgreSQL/Redis integration), a 29-step browser journey against a real database, an `axe-core` WCAG scan and `npm audit`.
**Not covered:** penetration testing by an independent party, load testing, your actual hosting/Cloudflare/S3 configuration, and a real email provider. Those are marked below.

Legend: **PASS** = implemented and verified here. **NEEDS CONFIGURATION** = the code is ready but depends on your environment. **FAIL / OPEN** = a known gap.

## Summary

| Area | Result |
|---|---|
| SQL injection | PASS |
| XSS (stored / reflected / DOM) | PASS (see CSP note) |
| CSRF | PASS |
| IDOR / BOLA | PASS |
| Authentication (OTP, admin 2-step) | PASS |
| Authorisation / RBAC | PASS |
| Session security | PASS |
| File uploads | PASS; malware scanning NEEDS CONFIGURATION |
| Rate limiting | PASS; client-IP trust NEEDS CONFIGURATION |
| Secrets management | PASS |
| CORS | PASS |
| Security headers | PASS |
| Payment-proof security | PASS |
| Certificate security | PASS |
| Data exposure / logging | PASS |
| Accessibility (automated) | PASS; manual testing NEEDS DOING |
| Dependency vulnerabilities | **OPEN** (2 transitive advisories) |
| Backups | NEEDS CONFIGURATION (not restore-tested) |
| Monitoring / alerting | NEEDS CONFIGURATION |

## Details and evidence

**SQL injection: PASS.** All data access goes through Prisma's parameterised queries. The single raw query (dashboard registrations) uses the `Prisma.sql` tagged template, which binds values. Tests send `' OR '1'='1`, `'; DROP TABLE users; --` and `UNION SELECT` payloads through the admin search and confirm they are treated as text and the tables survive (`tests/integration/security.test.ts`).

**XSS: PASS.** React escapes all output; there is no `dangerouslySetInnerHTML` except the JSON-LD helper, which serialises our own data and escapes `<`. Free-text input also has HTML tags stripped at validation (`plainTextSchema`), and stored contact messages render as plain text. *Note:* the CSP allows `'unsafe-inline'` scripts because Next.js's runtime requires it; moving to a per-request nonce CSP is a worthwhile hardening step, not a current exploit.

**CSRF: PASS.** Session cookies are `SameSite=Lax`; every mutating route additionally requires the browser-supplied `Origin`/`Sec-Fetch-Site` to match our host (`assertSameOrigin`), including a test that a look-alike origin (`localhost:3000.evil.example`) is refused. Server Actions use Next's built-in Origin/Host check. A cross-origin `curl` returned `CSRF_FAILED` in the live run. There is no per-session token; the origin check is the OWASP-recommended header-based defence.

**IDOR / BOLA: PASS.** Services look records up by *both* id and the session's user id and answer "not found" (never "forbidden") for someone else's data, so ids cannot be probed. Verified: another student cannot read or submit a task, open a payment, fetch a certificate, or attach someone else's uploaded file to their own payment. `/api/files/<id>` returns 401 anonymously and 404 for non-owners.

**Authentication: PASS.** OTPs are generated with a CSPRNG, stored only as a keyed hash, expire in minutes, are single-use, attempt-limited and never logged or returned. Admin sign-in is password **plus** an emailed code, with a 15-minute lockout after 5 failures, constant-time handling for unknown accounts, and a security event on repeated failures. *Fixed during this work:* the public OTP endpoint used to accept the admin purpose; it now refuses it. Not implemented: TOTP/WebAuthn (the second factor is email).

**Authorisation: PASS.** Every page and action calls `requireStaff(permission)` / `requireStudent()`; hiding buttons is cosmetic only. The matrix is in the database. Least privilege is enforced where it matters: a mentor can leave feedback on a final project but only someone with `completions.review` can approve it (approval completes the internship); only super admins can change payment settings, revoke certificates or manage admins. Tests assert these boundaries.

**Sessions: PASS.** Random 256-bit tokens, stored hashed; `HttpOnly`, `Secure` in production, `SameSite=Lax`; sliding expiry; **rotation** (students daily, admins every 30 minutes, with a 60-second overlap) verified live; all sessions are revoked on suspension, role change and password change; logout revokes server-side. No tokens in `localStorage`.

**File uploads: PASS / NEEDS CONFIGURATION.** Size limit, MIME allow-list, extension allow-list and **content sniffing** (a renamed executable or HTML/SVG-with-script is rejected and logged as `MALICIOUS_FILE_ATTEMPT`), random storage keys (no user-controlled paths), private storage, signed expiring URLs, PDFs with embedded JavaScript flagged. The scan job has a pluggable hook; connect ClamAV (or your provider's scanner) in `src/lib/security/file-scan.ts` for real antivirus coverage. The built-in checks are not a substitute for antivirus.

**Rate limiting: PASS / NEEDS CONFIGURATION.** Redis-backed, limits configurable by env, applied to OTP request/verify, registration, admin login, contact, uploads, payment proof, certificate verification and exports. It **fails closed in production** if Redis is unreachable. *Configuration:* the client IP is read from forwarded headers, so expose the app only via Cloudflare (or your trusted proxy), otherwise clients can spoof it.

**Secrets: PASS.** `.env*` and `/storage/` are git-ignored; startup validation rejects weak or dev-only values in production; audit logs redact keys containing `otp`, `password`, `token`, `secret` and similar (tested).

**CORS: PASS.** No `Access-Control-Allow-Origin` is emitted anywhere; extra origins would have to be listed explicitly in `CORS_ALLOWED_ORIGINS`.

**Headers: PASS.** CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection, and HSTS (production). Private file responses add `nosniff` and a sandboxing CSP.

**Payment-proof security: PASS.** A screenshot plus UTR only moves a request to *under review*. Approval is a single guarded transaction (`UNDER_REVIEW -> APPROVED`), so two admins clicking at once produce exactly one certificate (tested with a real race). UTRs are normalised and unique in the database; reuse is rejected and logged. Students must be certificate-eligible, can only attach their own screenshot, and are rate-limited. The fee is snapshotted at the time it becomes payable.

**Certificate security: PASS.** 160-bit random verification IDs, PDF generated by a background job, public page shows only name, internship, domain and date (a test asserts email, phone and college never appear), revocation is honoured, lookups are rate-limited and invalid lookups are logged. Wording makes no government/UGC/AICTE claims.

**Data exposure / logging: PASS.** Errors use a uniform envelope with no stack traces; nothing sensitive is logged; the dashboard shows aggregates only; exports are permission-gated, rate-limited, audited and neutralise spreadsheet formula injection.

**Accessibility: PASS (automated) / NEEDS DOING (manual).** `axe-core` (WCAG 2.1 A/AA) reports no violations across public pages in light and dark themes, plus student and admin pages. Forms have labels and announced errors; the 3D layer is `aria-hidden`, honours `prefers-reduced-motion`, and can be switched off. Automated tools find only part of the issues: test with a screen reader and keyboard-only before launch.

## Open items

1. **Dependency advisories (OPEN).** Next.js was upgraded to 15.5.27, which clears the critical advisory. Two moderate/high advisories remain *inside Next.js's own bundled dependencies* (`postcss`, `sharp`); they need an upstream Next release. They affect build-time CSS processing and image optimisation, neither of which handles user input here (the app uses unoptimised images). Re-run `npm audit` before launch.
2. **Antivirus** is not connected (above).
3. **Backups** are documented in `docs/DEPLOYMENT.md` but **have not been restore-tested on your infrastructure.**
4. **Monitoring:** set `SENTRY_DSN` and alerts for `SUSPICIOUS_ADMIN_LOGIN`, `MALICIOUS_FILE_ATTEMPT` and failed jobs.
5. **Independent review:** have a third party penetration-test the deployed system before taking real payments.
6. **Not tested here:** real email delivery, real S3/R2, Cloudflare, performance of the 3D scene on real GPUs and phones, and behaviour under production load.

Do not describe this system as "secure" on the strength of this report alone; it is a checklist of what was verified and what is still yours to verify.
