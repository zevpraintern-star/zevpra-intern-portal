import { NotFoundError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";

/**
 * The UPI QR is shown only to students who have become certificate-eligible, and to
 * staff who manage settings (so they can preview what students see).
 */
export const GET = route(async () => {
  throw new NotFoundError("Certificate payments are no longer available.");
});
