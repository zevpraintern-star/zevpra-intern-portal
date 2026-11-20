ALTER TABLE applications ADD COLUMN IF NOT EXISTS selected_project_due_at TIMESTAMPTZ(3);
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS late_penalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS late_penalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS task_score_percent DOUBLE PRECISION;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS project_score_percent DOUBLE PRECISION;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS overall_score_percent DOUBLE PRECISION;

-- Give currently active legacy assignments a fresh, difficulty-based window.
UPDATE task_assignments AS assignment
SET due_at = COALESCE(task.deadline, NOW() + CASE task.difficulty
  WHEN 'ADVANCED' THEN INTERVAL '7 days'
  WHEN 'INTERMEDIATE' THEN INTERVAL '5 days'
  ELSE INTERVAL '3 days'
END)
FROM tasks AS task
WHERE assignment.task_id = task.id
  AND assignment.due_at IS NULL
  AND assignment.status IN ('ASSIGNED', 'IN_PROGRESS');

-- Start a project window for students who already selected a project.
UPDATE applications AS application
SET selected_project_due_at = COALESCE(project.deadline, NOW() + CASE project.difficulty
  WHEN 'ADVANCED' THEN INTERVAL '28 days'
  WHEN 'INTERMEDIATE' THEN INTERVAL '14 days'
  ELSE INTERVAL '5 days'
END)
FROM projects AS project
WHERE application.selected_project_id = project.id
  AND application.selected_project_due_at IS NULL
  AND application.completion_status = 'IN_PROGRESS';

-- Schedule reminders for existing open work; the worker sends them five hours before due.
INSERT INTO background_jobs (id, type, payload, dedupe_key, run_at, created_at, updated_at)
SELECT gen_random_uuid(), 'NOTIFICATION', jsonb_build_object('kind', 'TASK_DEADLINE_REMINDER', 'taskId', assignment.task_id, 'studentId', assignment.student_id),
       'deadline-task:' || assignment.task_id || ':' || assignment.student_id,
       GREATEST(NOW(), assignment.due_at - INTERVAL '5 hours'), NOW(), NOW()
FROM task_assignments AS assignment
WHERE assignment.status IN ('ASSIGNED', 'IN_PROGRESS') AND assignment.due_at > NOW()
ON CONFLICT (dedupe_key) DO NOTHING;

INSERT INTO background_jobs (id, type, payload, dedupe_key, run_at, created_at, updated_at)
SELECT gen_random_uuid(), 'NOTIFICATION', jsonb_build_object('kind', 'PROJECT_DEADLINE_REMINDER', 'applicationId', application.id, 'projectId', project.id),
       'deadline-project:' || application.id || ':' || project.id,
       GREATEST(NOW(), application.selected_project_due_at - INTERVAL '5 hours'), NOW(), NOW()
FROM applications AS application
JOIN projects AS project ON project.id = application.selected_project_id
LEFT JOIN project_submissions AS submission ON submission.project_id = project.id AND submission.student_id = application.student_id
WHERE application.completion_status = 'IN_PROGRESS'
  AND application.selected_project_due_at > NOW()
  AND submission.id IS NULL
ON CONFLICT (dedupe_key) DO NOTHING;
