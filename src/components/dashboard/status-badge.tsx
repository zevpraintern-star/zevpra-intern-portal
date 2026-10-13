import { Badge } from "@/components/ui/badge";
import { humaniseEnumValue } from "@/lib/utils/text";

const TONE: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  APPROVED: "success", COMPLETED: "success", GENERATED: "success", VALID: "success", ACTIVE: "success", PUBLISHED: "success", SUCCEEDED: "success", CLEAN: "success", OK: "success",
  PENDING: "warning", SUBMITTED: "warning", UNDER_REVIEW: "warning", IN_PROGRESS: "warning", CHANGES_REQUESTED: "warning", NEW: "warning", QUEUED: "warning", RUNNING: "warning",
  REJECTED: "destructive", REVOKED: "destructive", FAILED: "destructive", SUSPENDED: "destructive", INFECTED: "destructive", SPAM: "destructive", HIGH: "destructive", CRITICAL: "destructive",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge variant="outline">-</Badge>;
  return <Badge variant={TONE[value] ?? "secondary"}>{humaniseEnumValue(value)}</Badge>;
}
