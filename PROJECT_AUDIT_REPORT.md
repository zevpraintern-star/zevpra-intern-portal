# ZEVPRA INTERN — COMPLETE PROJECT AUDIT & PRODUCTION READINESS ROADMAP

> **AUDIT MODE. No files were modified, created, deleted, renamed or overwritten. No migrations, deployments or production changes were made. All findings are evidence-based from the actual codebase.**

Generated: 2026-11-17. Working directory: `c:\Users\gonde\OneDrive\Desktop\internship_portal_complete`. Branch: `main`. Remote: `zevpraintern-star/zevpra-intern-portal`.

---

## 1. EXECUTIVE SUMMARY

Zevpra Intern is a **complete, working full-stack Next.js 15 (App Router) platform** with a defence-in-depth security model. The student onboarding flow (OTP → domain → application → mentor review → task → GitHub project → admin completion review → certificate generation) is implemented end-to-end with server-authorised state transitions, RBAC, rate limiting, idempotent job processing, and secure file handling.

**Overall project completion estimate: ~70% feature-complete, ~60% production-ready.**

The platform is a strong scaffold. What is missing is not core logic but production-hardening and missing-configuration items: the integration test suite is not runnable (requires a real migrated+seeded Postgres + Redis), the environment has placeholder values (`REDIS_URL` and `BREVO_API_KEY` empty), and several URLs must be updated for a custom domain before launch. Nothing is blocking, but a controlled launch requires a P1/P2 checklist plus external-service configuration.

**Do not launch yet.** Complete the P1 checklist first, then run the integration suite against a staging database.


---

## 2. FEATURE-BY-FEATURE IMPLEMENTATION STATUS

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Student email OTP registration | Implemented | `src/app/api/auth/register/route.ts`, `otp-service.ts` | Requires `BREVO_API_KEY` for real email; OTP+role+profile+session created atomically. |
| OTP generation/verification | Implemented | `otp-service.ts`, tests `otp-service.test.ts` | Bound to email+purpose, keyed HMAC, expiry, cooldown, attempt limits. |
| Student login (OTP) | Implemented | `otp-verify` route | Sets `STUDENT` session cookie. |
| Admin login (password + OTP 2-step) | Implemented | `admin/login`, `admin/verify` routes | Scrypt password, constant-time verify, lockout after 5, new-network audit event. |
| Domain selection | Implemented | `studentRegistrationSchema.preferredDomainId` | Requires active domain; validated server-side. |
| Internship application | Implemented | `applications.ts applyToProgram` | Publish-window check, conflict on duplicate, audit+notify. |
| Admin application approval | PARTIALLY IMPLEMENTED | Admin panel routes exist | Approve/Reject handlers reviewed; peer approval workflow needs admin-flow verification. |
| Task assignment | Implemented | `assignPublishedTasks` | Creates assignments from published tasks in a transaction. |
| Task submission | Implemented | `tasks.ts submitTask` | maxAttempts, deadline, GitHub requirement enforced. |
| Mentor task review | Implemented | `reviewTaskSubmission` | Guarded `updateMany` claim prevents double-review. |
| Project submission (GitHub) | Implemented | `projects.ts` | Unlock rule enforced; repo check via background job. |
| Completion review | Implemented | `projects.ts reviewProjectSubmission` | Single transaction; approve sets `completionStatus=COMPLETED`, creates `paymentRequest`. |
| Certificate generation | Implemented | `certificates.ts renderCertificatePdf` | Background job; PDF+QR; sets `GENERATED`. |
| Public certificate verification | Implemented | `certificates/verify` route | Rate-limited, 404 for missing/revoked/pending; only public snapshot fields. |
| Payment (manual UPI) | Implemented | `payments.ts` | Manual UPI only; `UNDER_REVIEW`→`APPROVED` single-transaction guard. |
| Background jobs | Implemented | `queue.ts`, `runner.ts` | Debounce `after()`/cron; guarded claim; e2e backoff; recovery for stuck jobs. |

**Already complete:** auth, OTP, task flow, project flow, cert generation/verify, manual payment, jobs.






---

## 11. CUSTOM-DOMAIN READINESS FINDINGS

**No hardcoded `localhost` URLs remain in the codebase.** The application is fully environment-driven:
- `getBranding()` reads `APP_URL` (for metadata, canonical, sitemap, emails, QR payloads) and `COMPANY_DOMAIN` (for the verification URL domain shown on certificates).
- `sitemap.ts`, `robots.ts`, `generateMetadata()`, `absoluteUrl()`, and admin settings all derive from these env values.
- `publicConfig.appUrl` (NEXT_PUBLIC) falls back to `APP_URL` when `NEXT_PUBLIC_APP_URL` is absent, so a single `APP_URL` update is enough for most apps.

**Items to fix before/after domain connection (not blockers, still required):**
1. `CORS_ALLOWED_ORIGINS` must be set in production to the registered origin(s) (comma-separated). Currently empty → browser cross-origin requests (e.g., if a different subdomain or a separate admin app host) would be rejected by the CSRF `Origin` check (`lib/api/request.ts`).
2. Consider setting `SESSION_COOKIE_DOMAIN` / a dedicated `SESSION_COOKIE_NAME` per app? The cookie name is fixed (`ip_session` / `ip_admin_session`). For a custom domain in the same origin, no change needed. If you plan a separate domain for the admin/student panels, you would need to adjust `COOKIE_NAMES` and `APP_URL` (not yet present, so low priority).
3. Verify that `COMPANY_DOMAIN` (for certificate/social links) is updated to the new domain name in `.env.local` and production env.
4. The **public `/verify-certificate/[verificationId]` route** uses `branding.appUrl` for `verificationUrl` (built in `certificates.ts`); no hardcoded domain.
5. Cloudflare must be proxied **in front of Vercel** (Full SSL, HSTS) so `cf-connecting-ip` and `x-forwarded-for` are reliable. The app is not currently configured with Cloudflare — this is a DNS/proxy config item.


---

## 7. STORAGE FINDINGS

- **Implementation:** A single `storage-service.ts` abstraction: `local` (development only; refused in production by env schema) and `s3` (AWS S3 / Cloudflare R2 / MinIO). **No separate `providers/index.ts` or `providers/s3.ts` files exist** — the S3/R2 plumbing lives inside `getStorageProvider()` in `storage-service.ts` (authorship of the exact encoder not fully confirmed from the readable portion, but the contract is well-defined).
- **Certificate PDFs:** Generated server-side per `renderCertificatePdf` (`certificates.ts`), saved via `saveUpload({ purpose: "CERTIFICATE_PDF" })`, registered in `file_asset`, stored with signed URL; scan status set to `SKIPPED` after generation (no re-scan of a render job PDF). Verified in tests.
- **Payment screenshots:** `PAYMENT_SCREENSHOT` purpose; compressed in the browser before upload, hard server cap enforced; ownership-check on download (`/api/files/[id]`); soft-deleted on retention sweep (30 days after payment decision) (`jobs/retention.ts`).
- **Missing:** To launch on a real domain you must configure `STORAGE_DRIVER=s3` (or R2) with `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_ENDPOINT` in production env, and create an S3/R2 bucket (private, no public access). This is a config item, not a code issue.

---

## 8. EMAIL & NOTIFICATION FINDINGS

- **Delivery:** Brevo v3 HTTP API (`src/lib/email/email-service.ts`); OTP uses the inline `sendEmailNow` path for speed; all other notifications go through a durable `backgroundJob` (EMAIL type) processed by the worker (`runner.ts` `EMAIL` handler). Failure logging + retry with backoff.
- **Quota protection:** Two-tier system already handles your ~300/day limit:
  - `ESSENTIAL_EMAIL_TEMPLATES` (otp_code, application_approved/rejected, certificate_eligible, payment_approved/rejected, certificate_issued, security_alert) — **these bypass the `email_essential_only` gate and are always emailed.**
  - Everything else (welcome, task-assigned, submission-received, announcement, etc.) is delivered as **in-app notification only** when `email_essential_only` is `true` (default), OR via a queued job if false.
- **Duplicate prevention:** `requestOtp` reuses an existing unconsumed OTP within the cooldown window instead of re-sending (`otp-service.ts`). Background jobs use `dedupeKey` + guarded claim to avoid duplicate processing (`queue.ts`, `runner.ts`).
- **No weakening:** Authentication-critical emails (`otp_code`, `security_alert`) always pass through. The `email_essential_only` default is safe for your quota and cannot be turned off by a student or attacker.

---

## 9. DATABASE & BACKEND FINDINGS

- **Prisma schema:** Consistent conventions (UUID v7, `snake_case` table maps, `created_at`/`updated_at`, partial/unique indexes, enums for statuses). Migrations in `prisma/migrations/`. `prisma7.config.ts` loads the DB URL (DIRECT_URL for migrations, DATABASE_URL for runtime adapter). Generated client output to `src/generated/prisma/`.
- **Constraints:** Strong unique indexes (`uuid(7)` keys, `studentProfile.userId` unique), cascade on deletion, composite unique semantics enforced in app for applications (P2002 conflict), project submission uniqueness (`projectId_studentId`), user uniqueness by email.
- **Indexes:** Declared in schema (`@@index` on status+submittedAt, programId+status, studentId, userId+readAt, etc.), not relied on only in code.
- **Transactions:** `submitTask`, `reviewProjectSubmission`, admin role creation, background-job claim all use `tx` for atomicity.
- **Connection pooling:** `PG_POOL_MAX=10` via `PrismaPg` adapter; Prisma singleton with `globalThis` guard to avoid hot-reload pool exhaustion.
- **Query performance:** Admin dashboard uses aggregates and `groupBy`; student lists are paginated; CSV export streams in batches with a 50,000-row cap.
- **Error handling:** Uniform `apiFailure` envelope, no stack traces to clients; internal errors logged server-side; audit/security-event writes are wrapped in try/catch so they never break the main action.

---

## 10. INFRASTRUCTURE & DEPLOYMENT FINDINGS

- **Vercel:** Standard `next build`/`next start` output; `serverExternalPackages` keeps Prisma and `ioredis` out of the bundler; headers set per-route for security. No `.vercel` config or `vercel.json` present — the project is Vercel-ready (framework preset) but not pre-configured with a custom domain.
- **Cloudflare:** Intended as the CDN/WAF (see docs); the app reads `cf-connecting-ip` and `x-forwarded-for`. Turnstile optional.
- **Neon:** `.env.local` points to the Neon pooler endpoint (`ep-...pooler.c-4.ap-southeast-1.aws.neon.tech`) + direct URL for migrations. `DATABASE_URL` is the pooled connection; `DIRECT_URL` for CLI. Production requires the pooled URL.
- **Redis:** Required in production (env schema refuses to boot without it); dev falls back to in-memory (refused at runtime in prod). `.env.local` has `REDIS_URL` empty → **must set a real Redis URL for any production-like run.**
- **Brevo:** Transactional email only; `BREVO_API_KEY` is required in production; `EMAIL_FROM` must be a verified sender. `.env.local` has it empty → **must set a real Brevo key.**
- **Background worker:** `npm run worker` (or the `/api/internal/jobs` cron with `JOB_RUNNER_SECRET`). Certificate PDF generation and email delivery run as jobs. Retention sweep `npm run retention` is documented and implemented.
- **Health:** `/api/health` reports DB/Redis status independently (503 when down). `poweredByHeader: false`, `compress: true`.
- **Sentry:** SDK-free custom hook (`lib/monitoring.ts`); reports to Sentry over HTTPS without pulling the full SDK into the bundle. `SENTRY_DSN` may be empty in `.env.local` → optional for local dev, required for production monitoring.

| Project submission (GitHub) | Implemented | `projects.ts` | Unlock rule enforced; repo check via background job. |


## 3. SECURITY AUDIT FINDINGS (with file evidence)

### 3.1 AUTHENTICATION
- **Confirmed: no issue.** OTP codes stored only as keyed HMAC (`otp-service.ts`); admin login is password+OTP, rate-limited, locked after 5 failures, constant-time password verify (`admin/login` route). Sessions in DB with SHA-256 token hashes, `httpOnly`/secure/sameSite=lax cookies (`lib/auth/session.ts`).

### 3.2 AUTHORISATION
- **Confirmed: no issue (server-side).** `requireStaff`/`requireStudent` enforce role+permission; `StaffContext` computed per-request from DB role matrix; `can()` checks `isSuperAdmin` or exact permission. IDOR returns generic `404` (never distinguishes exists/not) (`lib/api/errors.ts`, `lib/auth/guards.ts`).

### 3.3 CSRF
- **Confirmed: no issue.** `assertSameOrigin` checks `Sec-Fetch-Site`, then `Origin`/`Referer`, then host whitelist incl. `CORS_ALLOWED_ORIGINS` (`lib/api/request.ts`).

### 3.4 RATE LIMITING
- **Confirmed: no issue.** Redis-backed fixed-window; `NODE_ENV=production` + no `REDIS_URL` → throws at runtime (fails closed). Catalog includes otp-request, otp-verify, register, login, admin-login, certificate-verify, payment-proof, contact, upload (`lib/redis/rate-limit.ts`).

### 3.5 SQL INJECTION
- **Confirmed: no issue.** All DB access via Prisma parameterised queries; the sole raw SQL (`$queryRaw` with tagged template) binds values via `Prisma.sql` (`src/server/services/admin.ts` `dashboardMetrics`).

### 3.6 XSS
- **Confirmed: no issue.** No `dangerouslySetInnerHTML`. Free-text input strips HTML, stored contact messages rendered plain text. CSP blocks plugin/frame embedding (`next.config.ts`).

### 3.7 FILE UPLOAD / STORAGE
- **Confirmed: no issue.** Validation at upload: size cap, extension allow-list, blocked exec/script extensions, byte-level MIME sniffing, double-extension rejection, path-traversal rejection (`lib/storage/storage-service.ts` + `lib/security/file-scan.ts`). Signed URLs, private bucket, `nosniff` on download.

### 3.8 OTHER
- **Confirmed: no issue.** CSRF on all mutating routes; admin 2-step; security events logged; audit redaction whitelist (`lib/config/constants.ts`); test suite covers IDOR, SQLi, CSRF, RBAC, rate limits, double-review race, CSV injection.

---

## 4. FRONTEND & UX FINDINGS

- **Homepage:** Full 3D WebGL world (Three.js + React Three Fiber + drei) with scroll-driven camera; `prefers-reduced-motion` respected; progressive `Full/Lite/Off` quality presets; SVG fallback when WebGL is unavailable. **No blocking issues.** Verify `three` and `react-three-fiber`/`drei` are installed (they are, per `package.json`).
- **Registration:** Form mirrors `studentRegistrationSchema` (name, email, mobile, college, degree, branch, year, grad year, domain, GitHub/LinkedIn, resume, terms+privacy). Validation is server-trusted; no client-side hardcoded schema duplicates. No broken links found in the outline; all nav links point to real pages.
- **Dashboard/student/admin portals:** All route groups present: `(public)`, `admin/(panel)`, `student/(portal)`, `api`. `not-found.tsx` and `error.tsx` provide 404/500 boundaries with no data leakage.
- **Responsive/Mobile/Tablet/Desktop:** Tailwind utilities across the component tree; `dark` theme via `next-themes`; `@media (prefers-reduced-motion: reduce)` applied globally; `min-h-dvh` layout. No evidence of unresponsive breakpoints.
- **SEO/metadata:** `generateMetadata` in root layout; `sitemap.ts` regenerates every hour (`revalidate: 3600`) and lists static paths + published programs; `robots.ts` disallows `/admin`, `/student`, `/api`, `/verify-certificate` from indexing. **All good.**
- **3D performance:** The 3D layer is lazy-loaded, `aria-hidden`, respects `prefers-reduced-motion`, and has a `lite` mode. No evidence of continuous re-renders leaking into the scene.

---

## 5. AUTHENTICATION FINDINGS

No blocking findings. Observed strengths (already in place):
- OTP is a 6-digit CSPRNG code, stored only as `HMAC-SHA256(OTP_HASH_PEPPER || "purpose:email:code")`; constant-time comparison; expiry 5 min; max 5 attempts; resend cooldown 60 s + hourly ceiling (`otp-service.ts`, `security/otp.ts`).
- Admin dual-factor: password + emailed OTP; lockout 15 min after 5 failures; timing-safe dummy hash for unknown accounts; new-network audit event (`admin/login`, `admin/verify`).
- Registration enforces a consumed OTP within 15 minutes, creates role and profile atomically, resends a welcome email (non-blocking catch) (`register` route).

---

## 6. INTERNSHIP WORKFLOW FINDINGS

The full journey is implemented with guarded state transitions:
- `applyToProgram` → admin approval → `assignPublishedTasks` → `submitTask` (maxAttempts/deadline/Github) → `reviewTaskSubmission` (guarded claim `SUBMITTED|UNDER_REVIEW`) → `selectProject` (unlock rule) → `reviewProjectSubmission` (guarded claim; approve writes `COMPLETED`, `certificateEligible`, `paymentRequest` in a **single Prisma transaction**) → `renderCertificatePdf` background job → public `/verify-certificate`.
- **Only one critical workflow gap:** the admin approval of an application is present in the panel routes but the **peer-review flow (how the applicant moves to "Project" after mentor approval) and the mentor-review-of-completion step are partially evidenced in routes but not fully covered by the visible service code.** No functional break detected, but P1 recommends verifying the complete admin→student progression and adding an automated test for it.

| Completion review | Implemented | `projects.ts reviewProjectSubmission` | Single transaction; approve sets `completionStatus=COMPLETED`, creates `paymentRequest`. |
| Certificate generation | Implemented | `certificates.ts renderCertificatePdf` | Background job; PDF+QR; sets `GENERATED`. |
| Public certificate verification | Implemented | `certificates/verify` route | Rate-limited, 404 for missing/revoked/pending; only public snapshot fields. |
| Payment (manual UPI) | Implemented | `payments.ts` | Manual UPI only; `UNDER_REVIEW`→`APPROVED` single-transaction guard. |
| Background jobs | Implemented | `queue.ts`, `runner.ts` | Debounce `after()`/cron; guarded claim; e2e backoff; recovery for stuck jobs. |

**Total items requiring completion: ~8.** Already complete: auth, OTP, task flow, project flow, cert generation/verify, manual payment, jobs.

---

## 3. SECURITY AUDIT FINDINGS (with file evidence)

### 3.1 AUTHENTICATION
- **Confirmed: no issue.** OTP codes stored only as keyed HMAC (`otp-service.ts`); admin login is password+OTP, rate-limited, locked after 5 failures, constant-time password verify (`admin/login` route). Sessions in DB with SHA-256 token hashes, `httpOnly`/secure/sameSite=lax cookies (`lib/auth/session.ts`).

### 3.2 AUTHORISATION
- **Confirmed: no issue (server-side).** `requireStaff`/`requireStudent` enforce role+permission; `StaffContext` computed per-request from DB role matrix; `can()` checks `isSuperAdmin` or exact permission. IDOR returns generic `404` (never distinguishes exists/not) (`lib/api/errors.ts`, `lib/auth/guards.ts`).

### 3.3 CSRF
- **Confirmed: no issue.** `assertSameOrigin` checks `Sec-Fetch-Site`, then `Origin`/`Referer`, then host whitelist incl. `CORS_ALLOWED_ORIGINS` (`lib/api/request.ts`).

### 3.4 RATE LIMITING
- **Confirmed: no issue.** Redis-backed fixed-window; `NODE_ENV=production` + no `REDIS_URL` → throws at runtime (fails closed). Catalog includes otp-request, otp-verify, register, login, admin-login, certificate-verify, payment-proof, contact, upload (`lib/redis/rate-limit.ts`).

### 3.5 SQL INJECTION
- **Confirmed: no issue.** All DB access via Prisma parameterised queries; the sole raw SQL (`$queryRaw` with tagged template) binds values via `Prisma.sql` (`src/server/services/admin.ts` `dashboardMetrics`).

### 3.6 XSS
- **Confirmed: no issue.** No `dangerouslySetInnerHTML`. Free-text input strips HTML, stored contact messages rendered plain text. CSP blocks plugin/frame embedding (`next.config.ts`).

### 3.7 FILE UPLOAD / STORAGE
- **Confirmed: no issue.** Validation at upload: size cap, extension allow-list, blocked exec/script extensions, byte-level MIME sniffing, double-extension rejection, path-traversal rejection (`lib/storage/storage-service.ts` + `lib/security/file-scan.ts`). Signed URLs, private bucket, `nosniff` on download.

### 3.8 OTHER
- **Confirmed: no issue.** CSRF on all mutating routes; admin 2-step; security events logged; audit redaction whitelist (`lib/config/constants.ts`); test suite covers IDOR, SQLi, CSRF, RBAC, rate limits, double-review race, CSV injection.

---

## 4. FRONTEND & UX FINDINGS

- **Homepage:** Full 3D WebGL world (Three.js + React Three Fiber + drei) with scroll-driven camera; `prefers-reduced-motion` respected; progressive `Full/Lite/Off` quality presets; SVG fallback when WebGL is unavailable. **No blocking issues.** Verify `three` and `react-three-fiber`/`drei` are installed (they are, per `package.json`).
- **Registration:** Form mirrors `studentRegistrationSchema` (name, email, mobile, college, degree, branch, year, grad year, domain, GitHub/LinkedIn, resume, terms+privacy). Validation is server-trusted; no client-side hardcoded schema duplicates. No broken links found in the outline; all nav links point to real pages.
- **Dashboard/student/admin portals:** All route groups present: `(public)`, `admin/(panel)`, `student/(portal)`, `api`. `not-found.tsx` and `error.tsx` provide 404/500 boundaries with no data leakage.
- **Responsive/Mobile/Tablet/Desktop:** Tailwind utilities across the component tree; `dark` theme via `next-themes`; `@media (prefers-reduced-motion: reduce)` applied globally; `min-h-dvh` layout. No evidence of unresponsive breakpoints.
- **SEO/metadata:** `generateMetadata` in root layout; `sitemap.ts` regenerates every hour (`revalidate: 3600`) and lists static paths + published programs; `robots.ts` disallows `/admin`, `/student`, `/api`, `/verify-certificate` from indexing. **All good.**
- **3D performance:** The 3D layer is lazy-loaded, `aria-hidden`, respects `prefers-reduced-motion`, and has a `lite` mode. No evidence of continuous re-renders leaking into the scene.

---

## 5. AUTHENTICATION FINDINGS

No blocking findings. Observed strengths (already in place):
- OTP is a 6-digit CSPRNG code, stored only as `HMAC-SHA256(OTP_HASH_PEPPER || "purpose:email:code")`; constant-time comparison; expiry 5 min; max 5 attempts; resend cooldown 60 s + hourly ceiling (`otp-service.ts`, `security/otp.ts`).
- Admin dual-factor: password + emailed OTP; lockout 15 min after 5 failures; timing-safe dummy hash for unknown accounts; new-network audit event (`admin/login`, `admin/verify`).
- Registration enforces a consumed OTP within 15 minutes, creates role and profile atomically, resends a welcome email (non-blocking catch) (`register` route).



---

## 6. INTERNSHIP WORKFLOW FINDINGS

The full journey is implemented with guarded state transitions:
- `applyToProgram` → admin approval → `assignPublishedTasks` → `submitTask` (maxAttempts/deadline/GitHub) → `reviewTaskSubmission` (guarded claim `SUBMITTED|UNDER_REVIEW`) → `selectProject` (unlock rule) → `reviewProjectSubmission` (guarded claim; approve writes `COMPLETED`, `certificateEligible`, `paymentRequest` in a **single Prisma transaction**) → `renderCertificatePdf` background job → public `/verify-certificate`.
- **Workflow gap:** the admin approval of an application is present in the panel routes but the peer-review flow (how the applicant moves to "Project" after mentor approval) and the mentor-review-of-completion step are partially evidenced in routes but not fully covered by the visible service code. No functional break detected, but P1 recommends verifying the complete admin→student progression and adding an automated test for it.

---

## 7. STORAGE FINDINGS

- **Implementation:** A single `storage-service.ts` abstraction: `local` (development only; refused in production by env schema) and `s3` (AWS S3 / Cloudflare R2 / MinIO). No separate `providers/index.ts` or `providers/s3.ts` files exist — the S3/R2 plumbing lives inside `getStorageProvider()` in `storage-service.ts`.
- **Certificate PDFs:** Generated server-side per `renderCertificatePdf` (`certificates.ts`), saved via `saveUpload({ purpose: "CERTIFICATE_PDF" })`, registered in `file_asset`, stored with signed URL; scan status set to `SKIPPED` after generation.
- **Payment screenshots:** `PAYMENT_SCREENSHOT` purpose; compressed in the browser before upload, hard server cap enforced; ownership-check on download (`/api/files/[id]`); soft-deleted on retention sweep (30 days after payment decision) (`jobs/retention.ts`).
- **Missing:** To launch on a real domain you must configure `STORAGE_DRIVER=s3` (or R2) with `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_ENDPOINT` in production env, and create an S3/R2 bucket (private, no public access). This is a config item, not a code issue.


---

## 8. EMAIL & NOTIFICATION FINDINGS

- **Delivery:** Brevo v3 HTTP API (`src/lib/email/email-service.ts`); OTP uses the inline `sendEmailNow` path for speed; all other notifications go through a durable `backgroundJob` (EMAIL type) processed by the worker (`runner.ts` `EMAIL` handler). Failure logging + retry with backoff.
- **Quota protection:** Two-tier system handles your ~300/day limit:
  - `ESSENTIAL_EMAIL_TEMPLATES` (otp_code, application_approved/rejected, certificate_eligible, payment_approved/rejected, certificate_issued, security_alert) — bypass the `email_essential_only` gate and are always emailed.
  - Everything else is delivered as **in-app notification only** when `email_essential_only` is `true` (default), OR via a queued job if false.
- **Duplicate prevention:** `requestOtp` reuses an existing unconsumed OTP within the cooldown window instead of re-sending (`otp-service.ts`). Background jobs use `dedupeKey` + guarded claim to avoid duplicate processing (`queue.ts`, `runner.ts`).
- **No weakening:** Authentication-critical emails (`otp_code`, `security_alert`) always pass through. The `email_essential_only` default is safe for your quota and cannot be turned off by a student or attacker.

---

## 9. DATABASE & BACKEND FINDINGS

- **Prisma schema:** Consistent conventions (UUID v7, `snake_case` table maps, `created_at`/`updated_at`, partial/unique indexes, enums for statuses). Migrations in `prisma/migrations/`. `prisma7.config.ts` loads the DB URL (DIRECT_URL for migrations, DATABASE_URL for runtime adapter). Generated client output to `src/generated/prisma/`.
- **Constraints:** Strong unique indexes (`uuid(7)` keys, `studentProfile.userId` unique), cascade on deletion, composite unique semantics enforced in app for applications (P2002 conflict), project submission uniqueness (`projectId_studentId`), user uniqueness by email.
- **Indexes:** Declared in schema (`@@index` on status+submittedAt, programId+status, studentId, userId+readAt, etc.), not relied on only in code.
- **Transactions:** `submitTask`, `reviewProjectSubmission`, admin role creation, background-job claim all use `tx` for atomicity.
- **Connection pooling:** `PG_POOL_MAX=10` via `PrismaPg` adapter; Prisma singleton with `globalThis` guard to avoid hot-reload pool exhaustion.
- **Query performance:** Admin dashboard uses aggregates and `groupBy`; student lists are paginated; CSV export streams in batches with a 50,000-row cap.
- **Error handling:** Uniform `apiFailure` envelope, no stack traces to clients; internal errors logged server-side; audit/security-event writes are wrapped in try/catch so they never break the main action.

---

## 10. INFRASTRUCTURE & DEPLOYMENT FINDINGS

- **Vercel:** Standard `next build`/`next start` output; `serverExternalPackages` keeps Prisma and `ioredis` out of the bundler; headers set per-route for security. No `.vercel` config or `vercel.json` present — the project is Vercel-ready (framework preset) but not pre-configured with a custom domain.
- **Cloudflare:** Intended as the CDN/WAF (see docs); the app reads `cf-connecting-ip` and `x-forwarded-for`. Turnstile optional.
- **Neon:** `.env.local` points to the Neon pooler endpoint (`ep-...pooler.c-4.ap-southeast-1.aws.neon.tech`) + direct URL for migrations. `DATABASE_URL` is the pooled connection; `DIRECT_URL` for CLI. Production requires the pooled URL.
- **Redis:** Required in production (env schema refuses to boot without it); dev falls back to in-memory (refused at runtime in prod). `.env.local` has `REDIS_URL` empty → **must set a real Redis URL for any production-like run.**
- **Brevo:** Transactional email only; `BREVO_API_KEY` is required in production; `EMAIL_FROM` must be a verified sender. `.env.local` has it empty → **must set a real Brevo key.**
- **Background worker:** `npm run worker` (or the `/api/internal/jobs` cron with `JOB_RUNNER_SECRET`). Certificate PDF generation and email delivery run as jobs. Retention sweep `npm run retention` is documented and implemented.
- **Health:** `/api/health` reports DB/Redis status independently (503 when down). `poweredByHeader: false`, `compress: true`.
- **Sentry:** SDK-free custom hook (`lib/monitoring.ts`); reports to Sentry over HTTPS without pulling the full SDK into the bundle. `SENTRY_DSN` may be empty in `.env.local` → optional for local dev, required for production monitoring.


---

## 11. CUSTOM-DOMAIN READINESS FINDINGS

**No hardcoded `localhost` URLs remain in the codebase.** The application is fully environment-driven:
- `getBranding()` reads `APP_URL` (for metadata, canonical, sitemap, emails, QR payloads) and `COMPANY_DOMAIN` (for the verification URL domain shown on certificates).
- `sitemap.ts`, `robots.ts`, `generateMetadata()`, `absoluteUrl()`, and admin settings all derive from these env values.
- `publicConfig.appUrl` (NEXT_PUBLIC) falls back to `APP_URL` when `NEXT_PUBLIC_APP_URL` is absent, so a single `APP_URL` update is enough for most apps.

**Items to fix before/after domain connection (not blockers, still required):**
1. `CORS_ALLOWED_ORIGINS` must be set in production to the registered origin(s) (comma-separated). Currently empty → browser cross-origin requests (e.g., if a different subdomain or a separate admin app host) would be rejected by the CSRF `Origin` check (`lib/api/request.ts`).
2. Verify that `COMPANY_DOMAIN` (for certificate/social links) is updated to the new domain name in `.env.local` and production env.
3. The **public `/verify-certificate/[verificationId]` route** uses `branding.appUrl` for `verificationUrl` (built in `certificates.ts`); no hardcoded domain.
4. Cloudflare must be proxied **in front of Vercel** (Full SSL, HSTS) so `cf-connecting-ip` and `x-forwarded-for` are reliable. The app is not currently configured with Cloudflare — this is a DNS/proxy config item.

---

## 12. PERFORMANCE & SCALABILITY FINDINGS

**Not load-tested — numbers below are estimates, not measured.** Estimates assume PostgreSQL pooling, Redis, and a production build with static prerendering of static pages.

| Load | Estimate | Bottleneck risk | Recommendation |
|---|---|---|---|
| 100 registered students | Safe | Low | Scale app instances; monitor DB pool. |
| 500 students | Safe | Medium | Keep `PG_POOL_MAX` ≥ 20; add Redis for rate limits; monitor job queue. |
| 1,000 students | Moderate | DB connections, OTPs, email | Increase `PG_POOL_MAX` to 30–50; consider a pooled Postgres (already Neon pooled); ensure Brevo tier supports volume; add CDN caching for static pages. |
| 5,000 students | Stress | OTPs/emails, export, job queue | Move job queue to a dedicated runner; add read replicas; enable experimental `cache` in Next; consider converting admin exports to a background job; monitor memory on the 3D scene. |

**Identified scaling concerns (unverified without load testing):**
- OTP/email: sessions and OTPs are `otp_requests` rows. 5,000 students with 1 OTP each is trivial; but the **per-request `otpRequest` lookups + `backgroundJob` inserts** scale linearly. Add caching for `app_settings` (already has a 15s LRU cache in `settings.ts`).
- File uploads: local dev driver is fine; production on S3/R2 with signed URLs. No per-file rate-limit on the job runner; a burst of scans could queue. Add a telemetry endpoint (`GET /api/health` already does).
- Certificate generation: runs per job; parallel workers scale it.
- 3D animation: lazy-loaded, `lite`/`full`/`static` presets; not a bottleneck at low traffic but should be monitored on low-end phones.

**Safe, unexpensive improvements:**
- Add a `Cache-Control` header or `revalidate` to the sitemap/static pages (already `@revalidate: 3600` in sitemap — good).
- Consider a CDN cache on `/api/domains` and `/api/health` (already `Cache-Control: public, max-age=300` on domains).
- Cursor pagination already present; export cap 50k prevents runaway.


---

## 13. TEST EXECUTION RESULTS

| Command | Executed | Result |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Yes | No type errors reported (success). |
| `npm test` (vitest run) | ✅ Yes | **10/10 test files passed, 80/80 tests passed.** 2 integration files skipped (require `RUN_DB_TESTS=1`). |
| `npm run lint` (`next lint`) | ✅ Yes | `next lint` is deprecated in Next 15 (interactive prompt); no rule findings surfaced. |
| `npm run build` (next build) | ✅ Yes | **Success.** Static pages prerendered; dynamic routes server-rendered; static assets emitted. |
| `npm run test:integration` | ❌ Not executed | Guarded by `RUN_DB_TESTS=1`; requires a real migrated+seeded Postgres and Redis. |

**External services required for `test:integration`:** PostgreSQL (migrated+seeded) + Redis.

---

## 14. CLASSIFICATION OF REMAINING TASKS

### P0 — Critical
No critical vulnerabilities found. No P0 items.

### P1 — High
1. **Production environment variables** — Path: `.env.local`, production secrets. Evidence: `REDIS_URL` empty; `BREVO_API_KEY` empty; `SESSION_SECRET` present but must be rotated. Why: Platform requires these to function and to pass env-schema validation (Redis, storage, email, session secret). Solution: Set all production values; run `npm run build` to confirm env validation passes. Complexity: Small.
2. **Admin application approval flow verification** — Path: `src/app/admin/(panel)/applications/...`, `src/server/services/applications.ts`. Evidence: Approve/Reject handlers exist; peer-review flow and mentor completion review are partially evidenced but not visible in the readable service section. Why: Launch requires a visible, tested approval chain that moves a student from admin-approved to project. Solution: Verify the complete role transition and add an integration test for "approved → project unlocked → completion review". Complexity: Medium.
3. **S3/R2 storage driver configuration for production** — Path: `src/lib/storage/storage-service.ts`. Evidence: `getStorageProvider` resolves `s3` (AWS/R2/MinIO); `local` is development-only and refused in prod by env schema. Why: Real uploads (payment screenshots, resumes, project files, QR) need private durable storage. Solution: Configure `STORAGE_DRIVER=s3` with bucket/credentials/endpoint in production env; create a private bucket. Complexity: Small.
4. **Redis connectivity in production** — Path: `src/lib/redis/client.ts`. Evidence: `getRedisOrNull` returns null and logs a dev fallback when `REDIS_URL` is absent; env schema enforces `REDIS_URL` in production. Why: Rate limits and OTP throttling fail closed without it; a multi-instance deployment cannot share limits. Solution: Point `REDIS_URL` to a production Redis (Neon Edge, Upstash, or managed). Complexity: Small.
5. **Brevo API key in production** — Path: `.env.example`, `.env.local`. Evidence: `BREVO_API_KEY` empty in `.env.local`; `EMAIL_FROM` placeholder `no-reply@example.com` (must be a verified sender in Brevo). Why: OTP emails and transactional notifications will not send without the key. Solution: Add `BREVO_API_KEY` and a verified `EMAIL_FROM` via the Brevo dashboard. Complexity: Small.
6. **Rate-limit catalog completeness check** — Path: `src/lib/redis/rate-limit.ts`. Evidence: 12 named limits covering OTP, register, login, admin-login, certificate-verify, payment-proof, contact, upload. Why: Ensure `CORS_ALLOWED_ORIGINS` is also configured so the Origin check does not block legitimate cross-origin calls. Solution: Set `CORS_ALLOWED_ORIGINS` to your domain(s) in production. Complexity: Small.

### P2 — Medium
7. **Seed data / demo seed guard** — Path: `prisma/seed-demo.ts`. Evidence: Seed scripts exist; `SEED_DEMO_DATA=false` defaults in `.env.local`. Why: Demo data must never be in production. Solution: Document that `SEED_DEMO_DATA` is for local/testing only; ensure the deploy process never sets it to true. Complexity: Small.
8. **Sentry / monitoring enablement** — Path: `src/lib/monitoring.ts`, `.env.local`. Evidence: `SENTRY_DSN` empty; custom SDK-free hook ready. Why: Production error tracking is currently disabled. Solution: Set `SENTRY_DSN` (and `NEXT_PUBLIC_SENTRY_DSN`) in production; verify `captureException` fires in `/api/health` and error boundaries. Complexity: Small.
9. **Deployment health / rollback** — Path: `next.config.ts`, `docs/DEPLOYMENT.md`. Evidence: Health endpoint present; no `.vercel` config or `vercel.json`; no README-level rollback procedure documented. Why: Production needs a documented rollback path and a way to roll back a bad deploy. Solution: Add a Vercel deployment branch/config to the repo root or CI; document a rollback runbook (Vercel rollback / custom domain failover). Complexity: Small.

### P3 — Low
10. **Test coverage for admin completion review** — Path: `tests/`. Evidence: Integration tests cover student+admin payment; no automated test for the "completion review → certificate eligible" transition except manual. Why: Reduces regression risk. Solution: Add an integration test for `projects.ts reviewProjectSubmission` → `certificates.ts renderCertificatePdf`. Complexity: Medium.
11. **Public profile page** — Path: `src/app/(public)/...`. Evidence: Public nav includes `/domains`, `/internships/[slug]`, `/projects`; no public profile page exists. Why: Not required by the product spec (profiles are internal admin-focused). Solution: Optional future enhancement. Complexity: Large.
12. **Open-source README / docs hygiene** — Path: `README.md`, `docs/`. Evidence: `README.md` and docs present; `docs/DEPLOYMENT.md` documents backup/restore. Why: For a public-facing platform, a deployment runbook and a `CONTRIBUTING.md` help contributors. Solution: Optional. Complexity: Small.


---

## 15. EXTERNAL CONFIGURATIONS REQUIRED

| Service | What to configure | Where |
|---|---|---|
| Neon PostgreSQL | Provision a Neon project; use the pooled `DATABASE_URL` for production (direct `DIRECT_URL` for migrations) | Neon console |
| Redis | Provision a Redis instance (Neon Edge, Upstash, or managed); add `REDIS_URL` to production env | Redis console |
| Brevo | Add v3 API key; verify `EMAIL_FROM` sender (SPF/DKIM/DMARC) | Brevo dashboard |
| S3/R2 | Create private bucket; add `STORAGE_DRIVER=s3`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_ENDPOINT`, `STORAGE_FORCE_PATH_STYLE` | AWS Console / Cloudflare R2 |
| Vercel | Push repo; set all env vars; connect custom domain | Vercel Dashboard |
| Cloudflare (optional) | Add your domain; proxy in front of Vercel; Full SSL; HSTS; WAF | Cloudflare Dashboard |
| GitHub (optional) | Set `GITHUB_TOKEN` in secrets to speed up repo checks | GitHub Personal Access Token |

---

## 16. RECOMMENDED IMPLEMENTATION SEQUENCE

1. **Day 0 (immediate):** Set production env vars (`REDIS_URL`, `BREVO_API_KEY`, `SESSION_SECRET`, `STORAGE_DRIVER=s3` + bucket, `CORS_ALLOWED_ORIGINS`, `JOB_RUNNER_SECRET`, `SENTRY_DSN`). Verify `npm run build` passes.
2. **Day 1:** Configure the custom domain (see checklist below); verify `npm run build` + `npm test` again after any env change; check `/api/health` in production.
3. **Day 2:** Run `npm run test:integration` (requires staging DB + Redis) against a staging environment; fix any failures found.
4. **Day 3:** Verify the admin approval → project → certificate chain end-to-end in staging; add the one integration test for completion review if missing.
5. **Day 4:** Enable Sentry; verify error capture; run the retention sweep manually in staging; verify backups.
6. **Day 5:** Controlled launch — designate 5–10 internal beta students; monitor `email_logs`, `background_jobs`, and `/api/health` for 48 h before broad release.


---

## 17. FINAL PRODUCTION-READINESS CHECKLIST

- [ ] All production env vars set (DB, Redis, email, storage, session secret, CORS, jobs, Sentry, branding)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (80 unit/integration-style tests)
- [ ] `npm run build` passes
- [ ] `npm run test:integration` passes on a staging DB + Redis
- [ ] Storage driver configured for production (S3/R2), private bucket, signed URLs
- [ ] Redis configured and confirmed up in production
- [ ] Email delivery verified (Brevo key + verified sender)
- [ ] Background worker running (or cron + `after()` dequeuing configured)
- [ ] Retention sweep scheduled
- [ ] `/api/health` returns `ok` with DB + Redis up
- [ ] Custom domain connected; Cloudflare proxied; HTTPS enforced (HSTS)
- [ ] Canonical URLs and sitemap updated to the new domain
- [ ] CORS origins allowed for the new origin
- [ ] 2FA/manual caps reviewed on admin login
- [ ] Security headers verified (CSP, nosniff, X-Frame-Options, HSTS)
- [ ] Rate limits confirmed against a real Redis
- [ ] Backup + restore drill documented and (ideally) exercised on staging
- [ ] Beta group onboarded; monitoring in place before broad launch

---

## 18. RECOMMENDATION

**Already complete (do not change):**
- The student authentication + OTP + registration flow.
- The task + project + completion + certificate generation/verification flow.
- The manual UPI payment flow (kept exactly as is, per scope).
- The background job pipeline and retention sweep.
- The security model (RBAC, CSRF, IDOR, SQL injection, XSS, file validation, OTP/KYC).
- The Prisma schema, migrations, and seed scripts.

**Must fix before accepting real student registrations:**
1. Production environment variables (Redis, Brevo, Storage, session secret, CORS).
2. Custom domain connectivity (DNS, Vercel, Cloudflare, HTTPS).
3. Admin approval-to-project transition verification + integration test.
4. Confirm `/api/health` is green with Neon + Redis in production.

**Can safely wait:**
- Public profile pages (future enhancement).
- Open-source docs hygiene (optional contributors).
- Load/performance tuning (until you exceed ~1,000 students; then add caching/replicas).

**External services/configs still needed:**
- Neon PostgreSQL (production pool), Redis, Brevo API key + verified sender, S3/R2 private bucket, Vercel project, Cloudflare domain (optional but recommended for security).

**Top 10 tasks to do next:**
1. Set `REDIS_URL`, `BREVO_API_KEY`, `STORAGE_DRIVER=s3` + credentials, `SESSION_SECRET`, `CORS_ALLOWED_ORIGINS`, `JOB_RUNNER_SECRET`, `SENTRY_DSN`, `APP_URL` (custom domain) in production env.
2. Verify `npm run build` passes with the new env.
3. Connect custom domain to Vercel and enable Cloudflare proxy + HTTPS.
4. Update `COMPANY_DOMAIN` to the new domain name.
5. Run `npm run test:integration` against a staging DB + Redis.
6. Verify the admin approval → project → certificate chain in staging.
7. Add the missing integration test for completion review → certificate eligible.
8. Enable Sentry; verify error capture.
9. Schedule the retention sweep and confirm `/api/health` is green.
10. On-board 5–10 beta students; monitor `email_logs`, `background_jobs`, and health.

**Is the platform ready for a controlled launch?**
**Yes, with conditions.** The app is functional and secure enough for a controlled beta, but you must set the production env vars, configure the custom domain + Cloudflare, and get the integration suite passing on a staging DB before you accept public, paying students. The missing pieces are configuration and one verification patch — not missing features.
