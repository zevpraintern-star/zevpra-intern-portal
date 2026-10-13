/**
 * DEV ONLY:  npm run dev:otp -- someone@example.com [STUDENT_REGISTER|STUDENT_LOGIN|ADMIN_LOGIN]
 *
 * The console email driver intentionally never logs verification codes, and the database
 * stores only a hash. For local testing this recovers the latest code by checking all
 * 1,000,000 six-digit values against the stored hash (takes about a second).
 * It refuses to run when NODE_ENV=production.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev:otp must never run in production.");
  const [email, purposeArg] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npm run dev:otp -- email [purpose]");
  const purpose = purposeArg ?? "STUDENT_REGISTER";

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { verifyOtpCode } = await import("../src/lib/security/otp");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const normalised = email.trim().toLowerCase();
  const row = await prisma.otpRequest.findFirst({ where: { email: normalised, purpose: purpose as never, consumedAt: null }, orderBy: { createdAt: "desc" } });
  await prisma.$disconnect();
  if (!row) throw new Error("No pending code for that email/purpose.");

  for (let n = 0; n < 1_000_000; n += 1) {
    const code = String(n).padStart(6, "0");
    if (verifyOtpCode(code, row.codeHash, normalised, purpose as never)) {
      console.log(code);
      return;
    }
  }
  throw new Error("Code not found (is OTP_LENGTH different from 6?).");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
