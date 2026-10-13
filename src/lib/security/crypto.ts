import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

/**
 * Cryptographic primitives shared by sessions, OTPs, CSRF tokens and admin
 * credentials. Everything here is Node built-in crypto - no third-party crypto
 * wrappers, and no native build steps that could fail on a deployment host.
 */

const PASSWORD_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

/** SHA-256 digest as hex. Used for high-entropy secrets (session tokens, OTP codes). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Keyed digest, used where a server-side pepper must be mixed in. */
export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** URL-safe random token. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Cryptographically secure numeric code (default 6 digits, leading zeros kept). */
export function randomNumericCode(length = 6): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** Random uppercase alphanumeric string used in public identifiers. */
export function randomCode(length = 8, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"): string {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0;
    output += alphabet.charAt(byte % alphabet.length);
  }
  return output;
}

/**
 * Constant-time comparison for hex/latin strings of equal length.
 * Returns false instead of throwing when lengths differ.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Admin password hashing. Format: scrypt$<salt>$<hash> (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== PASSWORD_PREFIX) return false;
  const saltPart = parts[1];
  const hashPart = parts[2];
  if (!saltPart || !hashPart) return false;

  try {
    const salt = Buffer.from(saltPart, "base64url");
    const expected = Buffer.from(hashPart, "base64url");
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Deterministic, non-reversible fingerprint of structured data. Used to bind an
 * OTP to the payload that was validated when it was issued.
 */
export function fingerprintPayload(secret: string, payload: Record<string, unknown>): string {
  const canonical = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${String(payload[key] ?? "")}`)
    .join("&");
  return hmacSha256Hex(secret, canonical);
}
