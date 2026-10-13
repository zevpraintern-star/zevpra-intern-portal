import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

/**
 * Read-only delivery diagnostics:  npm run email:logs -- [limit]
 *
 * Prints the most recent rows of `email_logs`, the audit trail written for every
 * send attempt. That table never stores OTP codes, tokens or passwords, so the
 * output is safe to share while debugging "the code never arrived".
 *
 * dotenv does not override variables that are already set, so pointing it at
 * production is a matter of supplying the production connection string:
 *
 *   DATABASE_URL="$PROD_DATABASE_URL" npm run email:logs -- 20
 *
 * Reading a row with status FAILED and a populated `error` column tells you
 * exactly what the email provider returned (bad key, unverified sender, ...).
 */
async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Usage: npm run email:logs -- [limit]  (1-200, default 20)");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Run it with the connection string of the database you want to inspect.",
    );
  }

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const rows = await prisma.emailLog.findMany({
      orderBy: { queuedAt: "desc" },
      take: limit,
      select: {
        queuedAt: true,
        sentAt: true,
        status: true,
        templateKey: true,
        subject: true,
        toEmail: true,
        attempts: true,
        providerMessageId: true,
        error: true,
      },
    });

    if (rows.length === 0) {
      console.log("No email_logs rows found.");
      return;
    }

    for (const row of rows) {
      const stamp = row.queuedAt.toISOString();
      console.log(`${stamp}  ${row.status.padEnd(7)}  ${row.templateKey.padEnd(16)} -> ${row.toEmail}`);
      if (row.subject) console.log(`              subject: ${row.subject}`);
      if (row.sentAt) console.log(`              sentAt: ${row.sentAt.toISOString()}`);
      if (row.providerMessageId) console.log(`              providerMessageId: ${row.providerMessageId}`);
      if (row.error) console.log(`              error: ${row.error}`);
    }

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `\n${rows.length} row(s): ${Object.entries(counts)
        .map(([status, count]) => `${status}=${count}`)
        .join(" ")}`,
    );
    if ((counts.FAILED ?? 0) > 0) {
      console.log("FAILED rows above contain the provider's own error message.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
