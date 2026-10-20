# Change Log — Internship Portal Completion Work

## Baseline observations (before changes)

- Repo at c:/Users/gonde/OneDrive/Desktop/internship_portal_complete, Next.js 15 + Prisma 7 (adapter-pg), Neon PostgreSQL reachable via .env.local DATABASE_URL.
- git status shows many working-tree modifications vs HEAD 43fbe16 (feature work: hard tier, email quotas, etc.) — those are pre-existing in the working tree, not introduced by me.
- Database is seeded: 1 internship program (Python Development Internship, PUBLISHED, startDate=null, endDate=null), 4 roles, 22 permissions, 46 role_permissions, 3 users, 2 sessions.
- npm run build previously succeeded (.next and tsconfig.tsbuildinfo present).

## Phase 2 — Student Internship Learning Workflow

### Bugs found and fixed
- **BUG-2 (IDOR in task submission)**: submitTask attached fileIds to task submissions without calling assertAttachableFiles(). Fixed: added file ownership validation.
- **BUG-3 (No program validation in saveTaskAction)**: Tasks could be created with any programId. Fixed: validates the program exists before creating/updating.

### New feature: Student internship workspace
- Enhanced /student/tasks page to show an internship info card with domain, difficulty, duration, summary, skills, and program status alongside the task list.

## Bugs found during audit

### BUG-1: Cross-user permission cache collision (guards.ts)
cachedRolePermissions uses unstable_cache with key [role-permissions] that does NOT include the roleKeys argument. Next.js unstable_cache keys on keyParts only (function args are passed to fn but not part of the cache key). Result: if User A (e.g. MENTOR) loads a page first, their permissions are cached; User B (ADMIN) then receives User A cached permissions, which lack programs.manage, hiding the Internships menu. Same class of bug in student layout getUnreadCount (key [student-unread-count] omits userId).

### BUG-4: Inconsistent masked-email format in the OTP service (otp-service.ts)
`requestOtp` masked the address with two different implementations depending on the path: the "reuse within cooldown" branch called `maskEmail()` (star count derived from the local-part length), while the normal success path built the string inline as `${local.slice(0,2)}***@${domain}`. The same address was therefore rendered differently to the user depending on which code path ran, and the inline version threw a TypeError on a malformed address (no "@") because `domainPart` was `undefined`. Fixed: both paths now use the canonical `maskEmail()` helper, which also falls back to a generic "your email" label for malformed input.

### BUG-5: Resend counter not carried across OTP rows (otp-service.ts)
When a resend was issued, the new `otp_requests` row was created with `resendCount: (existing.resendCount ?? 0) + 1`, but `resendCount` was never carried forward onto the *replaced* row's successor chain in a way the hourly ceiling could observe reliably — the ceiling was evaluated against the previous row only, so a user could exceed `OTP_MAX_RESENDS_PER_HOUR` by alternating between a consumed/expired row (which resets the counter) and a live one. Fixed by tracking the count across the live row and enforcing `canResendOtp()` before issuing any new code.

- Repo at c:/Users/gonde/OneDrive/Desktop/internship_portal_complete, Next.js 15 + Prisma 7 (adapter-pg), Neon PostgreSQL reachable via .env.local DATABASE_URL.
- git status shows many working-tree modifications vs HEAD 43fbe16 (feature work: hard tier, email quotas, etc.) — those are pre-existing in the working tree, not introduced by me.
- Database is seeded: 1 internship program (Python Development Internship, PUBLISHED, startDate=null, endDate=null), 4 roles, 22 permissions, 46 role_permissions, 3 users, 2 sessions.
- npm run build previously succeeded (.next and tsconfig.tsbuildinfo present).

## Diagnostic scripts created (read-only, to be removed before finish)
- check-rbac.mts — dumped roles/permissions/role_permissions/users/sessions/internship_programs. Confirmed:
  - ADMIN role includes both programs.manage and projects.manage; SUPER_ADMIN has all permissions.
  - The only ADMIN session (user zevpra.intern@gmail.com) expired 2026-10-13T17:42Z — no valid admin session exists now.
  - Python Development Internship (PUBLISHED, startDate=null, endDate=null) exists — 1 record, must not duplicate.

## Bugs found during audit

### BUG-1: Cross-user permission cache collision (guards.ts)
cachedRolePermissions uses unstable_cache with key [role-permissions] that does NOT include the roleKeys argument. Next.js unstable_cache keys on keyParts only (function args are passed to fn but not part of the cache key). Result: if User A (e.g. MENTOR) loads a page first, their permissions are cached; User B (ADMIN) then receives User A cached permissions, which lack programs.manage, hiding the Internships menu. Same class of bug in student layout getUnreadCount (key [student-unread-count] omits userId).

## Validation baseline
- npx tsc --noEmit: PASS (exit 0)
- npx vitest run: PASS (73 passed, 20 integration tests skipped without RUN_DB_TESTS)
- npm run build: PASS (exit 0). Note: static generation of some public pages hits Prisma and logs prisma:error when DATABASE_URL is not reachable at build time; pages catch errors and render empty fallbacks. Build still succeeds.
- npx next lint: cannot run non-interactively (no ESLint config file; next lint prompts for config). Environmental limitation.

## Files changed

### 1. src/lib/auth/guards.ts
Root cause of missing Internships menu: cachedRolePermissions was wrapped in unstable_cache with a static key [role-permissions] that did NOT include the roleKeys argument. Next.js unstable_cache keys on keyParts only — function args are passed to fn but not part of the cache key. Result: if User A (e.g. MENTOR) loaded an admin page first, their permissions were cached; User B (ADMIN) then received User A cached permissions, which lack programs.manage, hiding the Internships menu. Same class of bug exposed admin users to wrong permissions (cross-user leakage).

Fix: Removed unstable_cache wrapper. cachedRolePermissions is now a plain async function that queries the DB on each request. A staff member permissions only change when their role changes (which revokes their session and forces re-login), so the result is always fresh for the session lifetime.

### 2. src/app/student/(portal)/layout.tsx
Same class of bug: getUnreadCount was wrapped in unstable_cache with key [student-unread-count] that did NOT include the userId argument. Different students would receive each other cached unread notification count.

Fix: Removed unstable_cache wrapper. unreadCount(student.userId) is called directly per request. Also removed unused unstable_cache import.

### Diagnostic script removed
- check-rbac.mts — removed (was a temporary read-only diagnostic).

## Validation results (after changes)
- npx tsc --noEmit: PASS (exit 0)
- npx vitest run: PASS (73 passed, 20 integration tests skipped without RUN_DB_TESTS — not run against production DB)
- npm run build: PASS (exit 0). Some public statically-generated pages log prisma:error at build time when DATABASE_URL is not reachable in the build environment; pages catch errors and render empty fallbacks. Build succeeds. Runtime pages are server-rendered with live DB access.
- npx next lint: Cannot run non-interactively — project has no ESLint config file and next lint prompts interactively. Environmental limitation, not caused by changes.

## Files NOT changed (intentionally)
- src/lib/config/admin-nav.ts — already correct: programs to /admin/programs with programs.manage permission
- src/app/admin/(panel)/programs/page.tsx — already correct: guards with requireStaffPage(programs.manage)
- src/app/admin/actions.ts saveProgramAction — already correct: validates, audits, no duplicate creation
- src/server/services/applications.ts listOpenPrograms() — already correct: handles endDate null, hides drafts, prevents duplicates via DB unique constraint
- Neon PostgreSQL database — no changes (all records preserved, including the single Python Development Internship)

## Phase 3 — Links-only submissions (no student file uploads)

### Schema (prisma/schema.prisma)
- Removed `TaskSubmission.files` relation and the `TaskSubmissionFile` model + `task_submission_files` join table.
- Removed `ProjectSubmission.files` relation and the `ProjectSubmissionFile` model + `project_submission_files` join table.
- Removed inverse relations `taskSubmissionFiles` and `projectSubmissionFiles` from `FileAsset`.
- `FileAsset` retained for resume, avatar, payment screenshot and certificate template flows.
- Migration: `prisma/migrations/20261020181300_remove_submission_file_join_tables/migration.sql` drops both join tables.

### Phase 4 — Seed internship programs, tasks and projects for all domains

**`prisma/seed.ts`**: Added bulk seeding so every active domain gets an internship program with tasks and a final project, instead of requiring manual entry per domain through the admin UI.

For each active domain, the seed creates:
- 1 `InternshipProgram` (published, 8 weeks, free, GitHub link required for completion)
- 4 `Task` records (2 beginner, 1 intermediate, 1 advanced — mix of text, GitHub link, and mixed submission types)
- 1 `Project` (final capstone project, GitHub link required, intermediate difficulty)

All records use idempotent upserts, so re-running the seed is safe and won't duplicate data.

### Validation (src/lib/validation/submission.ts)
- Removed `fileIds` from `sharedSubmissionFields` (used by task, project and completion submission schemas).
- Task `FILE` submission type now requires `githubUrl` (a link to hosted work) instead of attached files.
- Task `MIXED` submission type requires at least one of `githubUrl`, `liveUrl` or `textAnswer`.

### Services
- `src/server/services/tasks.ts`: Removed `assertAttachableFiles` import and call; removed `files.create` nested write from `submitTask`; removed `files` include from `getStudentTask`; FILE/MIXED validation now link-based.
- `src/server/services/projects.ts`: Removed `assertAttachableFiles` import and call; removed `projectSubmissionFile.createMany` from `submitProject`.
- `src/server/services/files.ts`: `assertAttachableFiles` kept (still used by payments for `PAYMENT_SCREENSHOT`); removed `taskSubmissionFiles`/`projectSubmissionFiles` from `_count` select and attached-count check.

### Actions (src/app/student/actions.ts)
- `submitTaskAction`: removed `fileIds` from form parsing.
- `submitProjectAction`: removed `fileIds` from form parsing.

### UI
- `src/app/student/(portal)/tasks/[id]/page.tsx`: Removed `FileField` import and the file-upload JSX for `FILE`/`MIXED` task types. Task submissions are now links-only (GitHub URL / live URL / text answer).
- `src/app/admin/(panel)/submissions/task/[id]/page.tsx`: Removed `files` include and the file list rendering from the task review page.
- `src/app/admin/(panel)/submissions/project/[id]/page.tsx`: Removed `files` include and the file list rendering from the project review page.
- `src/components/forms/file-field.tsx` and `src/app/api/uploads/route.ts`: Left intact — still used for resume/avatar/payment-screenshot/certificate-template uploads (non-student-upload flows).

### Tests (tests/integration/flow.test.ts)
- Removed `fileIds: []` from all `submitTask` and `submitProject` test calls.

### Validation results (after changes)
- npx tsc --noEmit: PASS (exit 0)
- npx vitest run: PASS (80 passed, 20 skipped)

### Database migration
- Could not apply migration against Neon DB in this environment (authentication failure). The migration SQL is staged at `prisma/migrations/20261020181300_remove_submission_file_join_tables/migration.sql` and must be applied via `npx prisma migrate deploy` (or `migrate dev`) when database credentials are available.
