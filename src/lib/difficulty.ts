import type { DifficultyLevel } from "@/generated/prisma/enums";


export interface DifficultyTier {
  key: "Easy" | "Medium" | "Hard";
  label: "Easy" | "Medium" | "Hard";
  description: string;
}

export const DIFFICULTY_TIERS: Record<DifficultyLevel, DifficultyTier> = {
  BEGINNER: {
    key: "Easy",
    label: "Easy",
    description:
      "Introductory tasks and a small single-repository project. The safest starting tier.",
  },
  INTERMEDIATE: {
    key: "Medium",
    label: "Medium",
    description:
      "Broader scope, multiple deliverables and a more complete public repository.",
  },
  ADVANCED: {
    key: "Hard",
    label: "Hard",
    description:
      "Production-grade scope, hardening and review depth expected before approval.",
  },
};

/** Human-readable label for a difficulty level. */
export function difficultyLabel(
  level: DifficultyLevel,
): DifficultyTier["label"] {
  return DIFFICULTY_TIERS[level].label;
}

/** Maps a difficulty level to a printed certificate template key. */
export function difficultyTierKey(
  level: DifficultyLevel,
): "standard" | "premium" | "hard" {
  switch (level) {
    case "ADVANCED":
      return "hard";
    case "INTERMEDIATE":
      return "premium";
    case "BEGINNER":
    default:
      return "standard";
  }
}

/** One platform-wide certificate fee for all difficulty tiers. */
export const DIFFICULTY_FEE_POLICY =
  "single platform-wide certificate fee";

export type CertificateTemplateKey = "standard" | "premium" | "hard";

/** Unknown or legacy keys fall back to the standard template. */
export function normalizeTemplateKey(
  key: string | null | undefined,
): CertificateTemplateKey {
  if (key === "premium" || key === "hard") {
    return key;
  }

  return "standard";
}

/** Fields needed for certificate-template selection. */
export interface CertificateTemplateCandidate {
  id: string;
  templateKey: string | null;
  version: number;
  isActive: boolean;
}

/**
 * Selects the template for a difficulty tier:
 * 1. Prefer the matching active template with the highest version.
 * 2. Otherwise use the highest-version active template.
 * 3. Return null when no active template exists.
 */
export function selectCertificateTemplate<
  T extends CertificateTemplateCandidate,
>(
  rows: readonly T[],
  difficulty: DifficultyLevel,
): T | null {
  const active = rows
    .filter((row) => row.isActive)
    .sort((a, b) => b.version - a.version);

  const tierKey = difficultyTierKey(difficulty);

  return (
    active.find(
      (row) => normalizeTemplateKey(row.templateKey) === tierKey,
    ) ??
    active[0] ??
    null
  );
}

/**
 * Groups projects into Easy, Medium, and Hard.
 * Advanced projects are excluded when the Hard tier is disabled.
 */
export function groupProjectsByDifficulty<
  T extends { difficulty: DifficultyLevel },
>(
  projects: readonly T[],
  isHardTierEnabled: boolean,
): {
  groups: Record<"easy" | "medium" | "hard", T[]>;
  hasAny: boolean;
} {
  const groups: Record<"easy" | "medium" | "hard", T[]> = {
    easy: [],
    medium: [],
    hard: [],
  };

  for (const project of projects) {
    switch (project.difficulty) {
      case "BEGINNER":
        groups.easy.push(project);
        break;

      case "INTERMEDIATE":
        groups.medium.push(project);
        break;

      case "ADVANCED":
        if (isHardTierEnabled) {
          groups.hard.push(project);
        }
        break;
    }
  }

  const hasAny =
    groups.easy.length > 0 ||
    groups.medium.length > 0 ||
    groups.hard.length > 0;

  return { groups, hasAny };
}