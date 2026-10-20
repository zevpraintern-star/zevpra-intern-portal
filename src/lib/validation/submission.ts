import { z } from "zod";

import { githubRepoUrlSchema, liveUrlSchema, plainTextSchema, requiredTextSchema, uuidSchema } from "./common";

/**
 * Task, project and final-completion submissions.
 *
 * Product requirement: every project hand-in and the final internship completion
 * must include a GitHub repository link, so those schemas require it outright.
 * Task submissions require it only when the task itself demands it.
 */

const sharedSubmissionFields = {
  liveUrl: z
    .union([liveUrlSchema, z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  notes: plainTextSchema(4000).optional(),
};

export const taskSubmissionSchema = z.object({
  taskId: uuidSchema,
  githubUrl: z
    .union([githubRepoUrlSchema, z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  explanation: requiredTextSchema(4000, 10).optional(),
  textAnswer: plainTextSchema(8000).optional(),
  hoursSpent: z.coerce.number().int().min(0).max(1000).optional(),
  ...sharedSubmissionFields,
});

export type TaskSubmissionInput = z.infer<typeof taskSubmissionSchema>;

/**
 * Applies the task-level GitHub requirement after shape validation, so the error
 * points at the githubUrl field instead of failing generically.
 */
export function enforceGithubRequirement<T extends { githubUrl?: string }>(
  input: T,
  requiresGithubLink: boolean,
): T {
  if (requiresGithubLink && !input.githubUrl) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["githubUrl"],
        message: "A public GitHub repository link is required for this submission.",
      },
    ]);
  }
  return input;
}

export const projectSubmissionSchema = z.object({
  projectId: uuidSchema,
  /** Mandatory for project submissions. */
  githubUrl: githubRepoUrlSchema,
  ...sharedSubmissionFields,
  /** A live demo URL is required for every project hand-in (links-only submission). */
  liveUrl: liveUrlSchema,
});

export type ProjectSubmissionInput = z.infer<typeof projectSubmissionSchema>;

/**
 * Final internship completion hand-in. This is what an administrator reviews
 * before a student becomes certificate eligible; the GitHub link is mandatory.
 */
export const completionSubmissionSchema = z.object({
  applicationId: uuidSchema,
  githubUrl: githubRepoUrlSchema,
  liveUrl: sharedSubmissionFields.liveUrl,
  summary: requiredTextSchema(4000, 20),
});

export type CompletionSubmissionInput = z.infer<typeof completionSubmissionSchema>;

/** Review actions performed by an admin or mentor. */
export const reviewDecisionSchema = z.object({
  submissionId: uuidSchema,
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  feedback: requiredTextSchema(2000, 5),
  pointsAwarded: z.coerce.number().int().min(0).max(1000).optional(),
  score: z.coerce.number().int().min(0).max(1000).optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
