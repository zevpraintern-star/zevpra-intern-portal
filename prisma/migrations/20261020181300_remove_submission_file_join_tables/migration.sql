-- Remove student file-upload join tables for task and project submissions.
-- Submissions are now links-only (GitHub URL / live URL / text answer).
-- FileAsset is retained for resume, avatar, payment screenshot and certificate flows.

-- Drop join tables (foreign keys cascade automatically)
DROP TABLE IF EXISTS "task_submission_files";
DROP TABLE IF EXISTS "project_submission_files";