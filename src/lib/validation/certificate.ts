import { z } from "zod";

import { CERTIFICATE } from "../config/constants";

/**
 * Public certificate verification (the /verify-certificate page).
 *
 * Only the human-readable certificate id printed on the certificate
 * (e.g. CERT-7F3K9Q2M) is accepted on this public lookup surface. The opaque
 * verification id is deliberately not searchable here, and every lookup is
 * rate limited in the route handler.
 *
 * The regex is intentionally lenient about the random characters: the database
 * lookup is the source of truth, so an id that uses a character outside the
 * generation alphabet simply resolves to "not found" rather than a hard 400.
 */
export const certificateVerifyQuerySchema = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter a certificate ID.")
    .max(40, "Enter a valid certificate ID.")
    .regex(
      new RegExp(`^${CERTIFICATE.prefix}-[A-Z0-9]{${CERTIFICATE.randomLength}}$`),
      `Enter a valid certificate ID, e.g. ${CERTIFICATE.prefix}-7F3K9Q2M.`,
    ),
});

export type CertificateVerifyQuery = z.infer<typeof certificateVerifyQuerySchema>;
