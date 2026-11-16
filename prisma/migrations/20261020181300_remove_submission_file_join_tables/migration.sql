-- Remove student file-upload join tables for task and project submissions.
-- Submissions are now links-only (GitHub URL / live URL / text answer).
-- FileAsset is retained for resume, avatar, payment screenshot and certificate flows.

-- Drop join tables (foreign keys cascade automatically)
DROP TABLE IF EXISTS "task_submission_files";
DROP TABLE IF EXISTS "project_submission_files";

-- Add difficulty column to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "difficulty" TEXT DEFAULT 'BEGINNER';
ALTER TABLE "projects" ALTER COLUMN "difficulty" SET DEFAULT 'BEGINNER';

-- Add projectDifficulty column to certificates table
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "project_difficulty" TEXT;

-- Add templateKey column to certificate_templates table
ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "template_key" VARCHAR(60);