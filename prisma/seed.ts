/**
 * Database seed for the Zevpra Intern internship platform.
 *
 * Idempotent: every write is an upsert, so running it repeatedly is safe.
 * Contains only factual, configuration-level data - no invented statistics,
 * testimonials, partnerships or placement claims.
 *
 * Usage:
 *   npm run db:seed                    (requires DATABASE_URL)
 *   npx tsx prisma/seed.ts --dry-run   (validates the payload without touching the DB)
 */
import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const scrypt = promisify(scryptCallback);
const DRY_RUN = process.argv.includes("--dry-run");
const PASSWORD_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const MAX_SEED_ATTEMPTS = 5;

function isTransientDatabaseError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      meta?: { driverAdapterError?: { cause?: unknown } };
    };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";

    if (
      ["P1001", "P1002", "P1017", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "57P01", "08003", "08006"].includes(code)
      || /connection (closed|terminated|reset)|server has closed the connection|connection timeout|socket hang up/i.test(message)
    ) {
      return true;
    }

    current = candidate.meta?.driverAdapterError?.cause ?? candidate.cause;
  }

  return false;
}

function retryDelayMs(attempt: number): number {
  const baseMs = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
  return baseMs + Math.floor(Math.random() * 500);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}


// ---------------------------------------------------------------------------
// RBAC catalogue
// ---------------------------------------------------------------------------

const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: "admin.dashboard.view", description: "View the admin dashboard" },
  { key: "students.view", description: "View student records" },
  { key: "students.manage", description: "Approve, reject, assign or suspend students" },
  { key: "students.export", description: "Export student data" },
  { key: "domains.manage", description: "Create, edit and delete domains" },
  { key: "programs.manage", description: "Create and edit internship programs" },
  { key: "tasks.manage", description: "Create and edit tasks" },
  { key: "tasks.review", description: "Review and grade task submissions" },
  { key: "projects.manage", description: "Create and edit projects" },
  { key: "projects.review", description: "Review project submissions" },
  { key: "applications.review", description: "Approve or reject applications" },
  { key: "completions.review", description: "Review final GitHub submissions" },
  { key: "payments.view", description: "View payment proofs" },
  { key: "payments.review", description: "Approve or reject certificate payments" },
  { key: "certificates.issue", description: "Generate and issue certificates" },
  { key: "certificates.revoke", description: "Revoke certificates" },
  { key: "announcements.manage", description: "Create announcements" },
  { key: "content.manage", description: "Manage FAQs and homepage sections" },
  { key: "settings.manage", description: "Manage platform settings (UPI ID, fee, QR)" },
  { key: "admins.manage", description: "Create admins and change roles" },
  { key: "security.view", description: "View security events and audit logs" },
  { key: "messages.manage", description: "Handle contact messages" },
];

const ROLE_MATRIX: Record<string, string[]> = {
  STUDENT: [],
  MENTOR: [
    "admin.dashboard.view",
    "students.view",
    "tasks.review",
    "projects.review",
    "announcements.manage",
  ],
  ADMIN: [
    "admin.dashboard.view",
    "students.view",
    "students.manage",
    "students.export",
    "domains.manage",
    "programs.manage",
    "tasks.manage",
    "tasks.review",
    "projects.manage",
    "projects.review",
    "applications.review",
    "completions.review",
    "payments.view",
    "payments.review",
    "certificates.issue",
    "announcements.manage",
    "content.manage",
    "security.view",
    "messages.manage",
  ],
  SUPER_ADMIN: PERMISSIONS.map((permission) => permission.key),
};

const ROLE_NAMES: Record<string, string> = {
  STUDENT: "Student",
  MENTOR: "Mentor",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super Administrator",
};

// ---------------------------------------------------------------------------
// Domain catalogue (specification section 10). Fully database driven so admins
// can add or retire domains without a code change or deployment.
// ---------------------------------------------------------------------------

interface SeedDomain {
  name: string;
  slug: string;
}

const DOMAIN_CATEGORIES: Array<{
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  domains: SeedDomain[];
}> = [
  {
    slug: "computer-science",
    name: "Computer Science & IT",
    description: "Software, data, security, cloud and emerging computing domains.",
    sortOrder: 10,
    domains: [
      { name: "Computer Science", slug: "computer-science" },
      { name: "Cybersecurity", slug: "cybersecurity" },
      { name: "Information Security", slug: "information-security" },
      { name: "Ethical Hacking", slug: "ethical-hacking" },
      { name: "Security Operations Center (SOC)", slug: "soc" },
      { name: "Cloud Computing", slug: "cloud-computing" },
      { name: "DevOps", slug: "devops" },
      { name: "Software Development", slug: "software-development" },
      { name: "Web Development", slug: "web-development" },
      { name: "Full Stack Development", slug: "full-stack-development" },
      { name: "Mobile Development", slug: "mobile-development" },
      { name: "Python", slug: "python" },
      { name: "Java", slug: "java" },
      { name: "C and C++", slug: "c-cpp" },
      { name: "Data Structures and Algorithms", slug: "dsa" },
      { name: "Database Management", slug: "database-management" },
      { name: "SQL", slug: "sql" },
      { name: "Artificial Intelligence", slug: "artificial-intelligence" },
      { name: "Machine Learning", slug: "machine-learning" },
      { name: "Deep Learning", slug: "deep-learning" },
      { name: "Data Science", slug: "data-science" },
      { name: "Data Analytics", slug: "data-analytics" },
      { name: "Generative AI", slug: "generative-ai" },
      { name: "Natural Language Processing", slug: "nlp" },
      { name: "Computer Vision", slug: "computer-vision" },
      { name: "Blockchain", slug: "blockchain" },
      { name: "Internet of Things (IoT)", slug: "iot" },
      { name: "Robotics", slug: "robotics" },
    ],
  },
  {
    slug: "electronics",
    name: "Electronics & Electrical",
    description: "Electronics, embedded, VLSI and electrical power domains.",
    sortOrder: 20,
    domains: [
      { name: "Electronics and Communication Engineering", slug: "ece" },
      { name: "Embedded Systems", slug: "embedded-systems" },
      { name: "VLSI Design", slug: "vlsi" },
      { name: "FPGA", slug: "fpga" },
      { name: "PCB Design", slug: "pcb-design" },
      { name: "Control Systems", slug: "control-systems" },
      { name: "Electrical Engineering", slug: "electrical-engineering" },
      { name: "Power Systems", slug: "power-systems" },
      { name: "Renewable Energy", slug: "renewable-energy" },
    ],
  },
  {
    slug: "mechanical",
    name: "Mechanical",
    description: "Design, manufacturing and automotive engineering domains.",
    sortOrder: 30,
    domains: [
      { name: "Mechanical Engineering", slug: "mechanical-engineering" },
      { name: "Automotive Engineering", slug: "automotive" },
      { name: "Computer Aided Design (CAD)", slug: "cad" },
      { name: "Computer Aided Manufacturing (CAM)", slug: "cam" },
      { name: "Manufacturing Engineering", slug: "manufacturing" },
      { name: "Industrial Engineering", slug: "industrial-engineering" },
    ],
  },
  {
    slug: "civil",
    name: "Civil",
    description: "Structures, construction technology and environmental engineering.",
    sortOrder: 40,
    domains: [
      { name: "Civil Engineering", slug: "civil-engineering" },
      { name: "Structural Engineering", slug: "structural-engineering" },
      { name: "Construction Technology", slug: "construction-technology" },
      { name: "Environmental Engineering", slug: "environmental-engineering" },
    ],
  },
  {
    slug: "other-engineering",
    name: "Other Engineering",
    description: "Additional engineering branches managed by administrators.",
    sortOrder: 50,
    domains: [],
  },
];

// ---------------------------------------------------------------------------
// Runtime configuration (admin editable)
// ---------------------------------------------------------------------------

const DEFAULT_CERTIFICATE_DISCLAIMER =
  "This certificate confirms participation in and completion of an online internship program offered by {{companyName}}. It is not a government, university, UGC or AICTE approved credential, and it is not a guarantee of employment.";

const APP_SETTINGS: Array<{
  key: string;
  value: unknown;
  valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
  category: string;
  label: string;
  description?: string;
}> = [
  {
    key: "email_essential_only",
    value: true,
    valueType: "BOOLEAN",
    category: "email",
    label: "Essential emails only",
    description: "When on, only security- and outcome-critical emails are sent; every other event stays an in-app notification.",
  },
  {
    key: "hard_tier_enabled",
    value: false,
    valueType: "BOOLEAN",
    category: "certificates",
    label: "Hard-tier enabled",
    description: "When off, the Hard difficulty tier and hard-tier certificate template are unavailable.",
  },

  {
    key: "certificate_disclaimer",
    value: DEFAULT_CERTIFICATE_DISCLAIMER,
    valueType: "STRING",
    category: "certificates",
    label: "Certificate disclaimer",
    description: "Printed on every certificate. Do not add accreditation claims here.",
  },
  {
    key: "completion_requires_github_link",
    value: true,
    valueType: "BOOLEAN",
    category: "academics",
    label: "Final submission requires a GitHub link",
    description: "Students must submit a public GitHub repository link to finish a program.",
  },
  {
    key: "project_requires_github_link",
    value: true,
    valueType: "BOOLEAN",
    category: "academics",
    label: "Project submissions require a GitHub link",
  },
  {
    key: "brand.company_name",
    value: process.env.COMPANY_NAME ?? "Zevpra Intern",
    valueType: "STRING",
    category: "branding",
    label: "Company name",
    description: "Display name shown across the portal, emails and certificates.",
  },
  {
    key: "brand.support_email",
    value: process.env.SUPPORT_EMAIL ?? "zevpra.intern@gmail.com",
    valueType: "STRING",
    category: "branding",
    label: "Support email",
  },
];

// ---------------------------------------------------------------------------
// Homepage sections (specification section 78). Copy only, no fake metrics.
// ---------------------------------------------------------------------------

const HOMEPAGE_SECTIONS: Array<{
  key: string;
  title: string;
  subtitle?: string;
  sortOrder: number;
}> = [
  {
    key: "hero",
    title: "Learn. Build. Intern. Grow.",
    subtitle:
      "Free online internships designed to help engineering students build practical skills through structured learning, tasks and projects.",
    sortOrder: 10,
  },
  {
    key: "benefits",
    title: "Why students choose us",
    subtitle: "Everything you need to move from theory to working software.",
    sortOrder: 20,
  },
  {
    key: "domains",
    title: "Internship domains",
    subtitle: "Engineering domains across computer science, electronics, mechanical and civil.",
    sortOrder: 30,
  },
  {
    key: "how_it_works",
    title: "How it works",
    subtitle: "Six clear steps from registration to certificate.",
    sortOrder: 40,
  },
  {
    key: "featured_internships",
    title: "Featured internships",
    subtitle: "Structured, task driven programs with a final project.",
    sortOrder: 50,
  },
  {
    key: "why_us",
    title: "Why learn with us",
    subtitle: "Mentor reviewed submissions, real deliverables and transparent policies.",
    sortOrder: 60,
  },
  {
    key: "project_learning",
    title: "Project based learning",
    subtitle: "Every program ends with a GitHub hosted final project.",
    sortOrder: 70,
  },
  {
    key: "certificate",
    title: "Verified certificates",
    subtitle:
      "Free digital certificate after your final project is approved, with a public verification page and QR code.",
    sortOrder: 80,
  },
  { key: "faq", title: "Frequently asked questions", sortOrder: 90 },
  {
    key: "cta",
    title: "Start your internship today",
    subtitle: "Registration is free. No payment is required to join.",
    sortOrder: 100,
  },
];

// ---------------------------------------------------------------------------
// Factual FAQ content
// ---------------------------------------------------------------------------

const FAQS: Array<{ question: string; answer: string; category: string; sortOrder: number }> = [
  {
    question: "Is the internship really free?",
    answer:
      "Yes. Joining an internship program, completing tasks and building the final project are completely free. There is no fee to register, join a batch or submit work.",
    category: "internship",
    sortOrder: 10,
  },
  {
    question: "Are certificates free?",
    answer:
      "Yes. Digital certificates are free after your final project is approved.",
    category: "certificate",
    sortOrder: 20,
  },
  {
    question: "What do I need to submit to complete an internship?",
    answer:
      "You complete the assigned tasks, submit your project work, and finally submit your finished project as a public GitHub repository link from your dashboard. Your combined marks must be greater than 85% to qualify for certificate release.",
    category: "internship",
    sortOrder: 50,
  },
  {
    question: "How is a certificate verified?",
    answer:
      "Every certificate carries a unique certificate ID, a verification ID, a QR code and a public verification link. Anyone can open the verification page to confirm that a certificate is valid, revoked or not found. The page shows only the minimum required information.",
    category: "certificate",
    sortOrder: 60,
  },
  {
    question: "Is the certificate government or university approved?",
    answer:
      "No. The certificate documents the internship work completed with us. It is not a government, university, UGC or AICTE approved credential, and we do not claim accreditation we have not obtained.",
    category: "certificate",
    sortOrder: 70,
  },
];

// ---------------------------------------------------------------------------
// Transactional email templates (specification section 37)
// ---------------------------------------------------------------------------

function emailShell(heading: string, bodyLines: string[], ctaLabel?: string): string {
  const paragraphs = bodyLines.map((line) => `<p style="margin:0 0 12px">${line}</p>`).join("");
  const cta = ctaLabel
    ? '<p style="margin:20px 0"><a href="{{actionUrl}}" style="background:#4f46e5;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">' +
      ctaLabel +
      "</a></p>"
    : "";
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">',
    `<h2 style="margin:0 0 16px">${heading}</h2>`,
    paragraphs,
    cta,
    '<p style="margin:24px 0 0;color:#6b7280;font-size:13px">',
    "This is an automated message from {{companyName}}. Never share one-time codes or private links with anyone.",
    "</p>",
    "</div>",
  ].join("");
}

interface SeedEmailTemplate {
  key: string;
  name: string;
  subject: string;
  html: string;
  text: string;
}

const EMAIL_TEMPLATES: SeedEmailTemplate[] = [
  {
    key: "otp_code",
    name: "Email OTP",
    subject: "{{companyName}} verification code",
    html: emailShell("Your one-time code", [
      "Hello {{recipientName}},",
      "Use the code below to continue. It expires in {{expiryMinutes}} minutes.",
      '<span style="font-size:28px;letter-spacing:6px;font-weight:bold">{{code}}</span>',
      "If you did not request this code you can ignore this email.",
    ]),
    text: "Your {{companyName}} verification code is {{code}}. It expires in {{expiryMinutes}} minutes.",
  },
  {
    key: "welcome",
    name: "Welcome",
    subject: "Welcome to {{companyName}}",
    html: emailShell(
      "Welcome aboard",
      [
        "Hello {{recipientName}},",
        "Your account is ready. You can now browse internship programs and apply - joining is free.",
      ],
      "Open your dashboard",
    ),
    text: "Welcome to {{companyName}}. Open your dashboard: {{actionUrl}}",
  },
  {
    key: "application_received",
    name: "Application received",
    subject: "We received your application",
    html: emailShell("Application received", [
      "Hello {{recipientName}},",
      "We received your application for {{programTitle}}.",
      "Our team will review it and you will be notified by email once a decision is made.",
    ]),
    text: "We received your application for {{programTitle}}.",
  },
  {
    key: "application_approved",
    name: "Application approved",
    subject: "Your application was approved",
    html: emailShell(
      "Application approved",
      [
        "Hello {{recipientName}},",
        "Your application for {{programTitle}} has been approved. Tasks will appear in your dashboard.",
      ],
      "Open my internship",
    ),
    text: "Your application for {{programTitle}} was approved.",
  },
  {
    key: "application_rejected",
    name: "Application rejected",
    subject: "Update on your application",
    html: emailShell("Application update", [
      "Hello {{recipientName}},",
      "Your application for {{programTitle}} was not approved.",
      "Reason: {{reason}}",
      "You are welcome to apply to another program.",
    ]),
    text: "Your application for {{programTitle}} was not approved. Reason: {{reason}}",
  },
  {
    key: "task_assigned",
    name: "Task assigned",
    subject: "New task assigned: {{taskTitle}}",
    html: emailShell(
      "New task assigned",
      [
        "Hello {{recipientName}},",
        "A new task has been assigned to you: {{taskTitle}}.",
        "Due: {{dueDate}}",
      ],
      "View task",
    ),
    text: "New task assigned: {{taskTitle}}. Due: {{dueDate}}",
  },
  {
    key: "submission_received",
    name: "Submission received",
    subject: "We received your submission",
    html: emailShell("Submission received", [
      "Hello {{recipientName}},",
      "We received your submission for {{itemTitle}}. A reviewer will look at it shortly.",
    ]),
    text: "We received your submission for {{itemTitle}}.",
  },
  {
    key: "submission_approved",
    name: "Submission approved",
    subject: "Your submission was approved",
    html: emailShell("Submission approved", [
      "Hello {{recipientName}},",
      "Your submission for {{itemTitle}} was approved.",
      "Feedback: {{feedback}}",
    ]),
    text: "Your submission for {{itemTitle}} was approved. Feedback: {{feedback}}",
  },
  {
    key: "submission_rejected",
    name: "Submission rejected",
    subject: "Your submission needs attention",
    html: emailShell("Submission update", [
      "Hello {{recipientName}},",
      "Your submission for {{itemTitle}} was not approved.",
      "Feedback: {{feedback}}",
    ]),
    text: "Your submission for {{itemTitle}} was not approved. Feedback: {{feedback}}",
  },
  {
    key: "certificate_eligible",
    name: "Certificate eligible",
    subject: "You are eligible for a certificate",
    html: emailShell(
      "Certificate eligibility confirmed",
      [
        "Hello {{recipientName}},",
        "You are eligible for a {{programTitle}} certificate.",
        "Your digital certificate is free. It will be prepared after your final project is approved.",
      ],
      "Open certificate section",
    ),
    text: "Your {{programTitle}} digital certificate is free and will be prepared after your final project is approved.",
  },
  {
    key: "payment_submitted",
    name: "Payment proof submitted",
    subject: "Payment proof received - under review",
    html: emailShell("Payment under review", [
      "Hello {{recipientName}},",
      "We received your payment proof for {{programTitle}} with UTR {{utr}}.",
      "Your payment is now under manual review. A certificate is generated only after approval.",
    ]),
    text: "Payment proof received. UTR {{utr}}. Status: under review.",
  },
  {
    key: "payment_approved",
    name: "Payment approved",
    subject: "Payment approved - certificate issued",
    html: emailShell(
      "Payment approved",
      [
        "Hello {{recipientName}},",
        "Your certificate payment has been approved and your certificate has been issued.",
        "Certificate ID: {{certificateId}}",
      ],
      "View certificate",
    ),
    text: "Payment approved. Certificate ID: {{certificateId}}.",
  },
  {
    key: "payment_rejected",
    name: "Payment rejected",
    subject: "Payment proof could not be verified",
    html: emailShell(
      "Payment review update",
      [
        "Hello {{recipientName}},",
        "We could not verify your payment proof.",
        "Reason: {{reason}}",
        "Certificate payments are no longer accepted. Please contact support if you need help with a payment made before this change.",
      ],
      "Contact support",
    ),
    text: "Payment proof could not be verified. Reason: {{reason}}",
  },
  {
    key: "certificate_issued",
    name: "Certificate issued",
    subject: "Your certificate is ready",
    html: emailShell(
      "Certificate issued",
      [
        "Hello {{recipientName}},",
        "Your {{programTitle}} certificate is ready to download.",
        "Verification link: {{verificationUrl}}",
      ],
      "Download certificate",
    ),
    text: "Your certificate is ready. Verify at {{verificationUrl}}",
  },
  {
    key: "security_alert",
    name: "Security notification",
    subject: "Security notice for your account",
    html: emailShell("Security notice", [
      "Hello {{recipientName}},",
      "{{activity}}",
      "If this was not you, contact support immediately at {{supportEmail}}.",
    ]),
    text: "Security notice: {{activity}}",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function createClient(): { prisma: PrismaClient; disconnect: () => Promise<void> } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and configure PostgreSQL.",
    );
  }
  const adapter = new PrismaPg({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  const prisma = new PrismaClient({ adapter });
  return { prisma, disconnect: () => prisma.$disconnect() };
}

function plannedSummary() {
  const domains = DOMAIN_CATEGORIES.reduce((total, item) => total + item.domains.length, 0);
  return {
    roles: Object.keys(ROLE_MATRIX),
    permissions: PERMISSIONS.length,
    domainCategories: DOMAIN_CATEGORIES.length,
    domains,
    settings: APP_SETTINGS.length,
    homepageSections: HOMEPAGE_SECTIONS.length,
    faqs: FAQS.length,
    emailTemplates: EMAIL_TEMPLATES.length,
  };
}

async function main(attempt = 1): Promise<void> {
  if (DRY_RUN) {
    console.info("[seed] dry run - no database writes performed");
    console.info(`[seed] planned payload: ${JSON.stringify(plannedSummary(), null, 2)}`);
    return;
  }

  const { prisma, disconnect } = createClient();

  let shouldRetry = false;
  try {
    // 1. Permissions ---------------------------------------------------------
    for (const permission of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: { description: permission.description },
        create: { key: permission.key, description: permission.description },
      });
    }

    // 2. Roles and their permission grants -----------------------------------
    const roleIdByKey = new Map<string, string>();
    for (const [key, permissions] of Object.entries(ROLE_MATRIX)) {
      const role = await prisma.role.upsert({
        where: { key: key as never },
        update: { name: ROLE_NAMES[key] ?? key },
        create: { key: key as never, name: ROLE_NAMES[key] ?? key, isSystem: true },
      });
      roleIdByKey.set(key, role.id);

      for (const permissionKey of permissions) {
        const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
        if (!permission) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    // 3. Domain categories and domains ---------------------------------------
    let domainTotal = 0;
    for (const category of DOMAIN_CATEGORIES) {
      const categoryRow = await prisma.domainCategory.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
        },
        create: {
          slug: category.slug,
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
        },
      });

      let index = 0;
      for (const domain of category.domains) {
        index += 1;
        await prisma.domain.upsert({
          where: { slug: domain.slug },
          update: { name: domain.name, categoryId: categoryRow.id, sortOrder: index * 10 },
          create: {
            slug: domain.slug,
            name: domain.name,
            categoryId: categoryRow.id,
            sortOrder: index * 10,
            isActive: true,
          },
        });
        domainTotal += 1;
      }
    }

    // 3.5. Difficulty-tiered internship programs, tasks and projects for every active domain --
    const allDomains = await prisma.domain.findMany({ where: { isActive: true } });

    for (const domain of allDomains) {
      const tracks = [
        { key: "easy", label: "Easy: Foundations", difficulty: "BEGINNER" as const, taskDifficulty: "BEGINNER" as const, weeks: 4,
          focus: "core concepts and guided practice", points: 10,
          tasks: [
            { title: "Create a core concepts map", description: `Explain the essential ideas and vocabulary used in ${domain.name}.`, instructions: `Create a glossary of at least eight important ${domain.name} terms. Show how at least three concepts connect, and give a practical example for each. Submit a clear concept map and short explanations in your repository README.` },
            { title: "Complete a guided beginner exercise", description: `Follow a beginner-level ${domain.name} exercise and record each step and result.`, instructions: `Choose or design a safe beginner exercise in ${domain.name}. Document the setup, list the steps in order, record the inputs and outputs or observations, and explain what each result means. Include evidence such as screenshots, diagrams, calculations, or code as appropriate.` },
            { title: "Solve a small domain challenge", description: `Use the foundations of ${domain.name} to solve one clearly scoped practical problem.`, instructions: `Choose one small, real-world problem that can be addressed with beginner ${domain.name} skills. State the problem and assumptions, show your solution, and explain how someone can reproduce or review the result. Include one limitation and a sensible next improvement.` },
          ],
          project: "Foundations Portfolio" },
        { key: "easy-lab", label: "Easy: Practical Lab", difficulty: "BEGINNER" as const, taskDifficulty: "BEGINNER" as const, weeks: 4,
          focus: "guided labs, essential tools, and small practical outcomes", points: 10,
          tasks: [
            { title: "Compare essential tools", description: `Identify and compare tools commonly used in ${domain.name}.`, instructions: `Select three tools, methods, or resources used in ${domain.name}. For each, explain its purpose, the problem it solves, basic setup or use, and one strength and limitation. Present the comparison as a table with links to reliable documentation.` },
            { title: "Reproduce a beginner lab", description: `Repeat a small ${domain.name} lab and keep a traceable record of the procedure.`, instructions: `Perform a beginner-friendly ${domain.name} lab or practical procedure. Record materials or software, starting conditions, numbered steps, and observations at each stage. Include enough detail that another beginner can reproduce it safely.` },
            { title: "Present and interpret lab results", description: `Turn your ${domain.name} lab observations into a clear result and conclusion.`, instructions: `Organize the results from your lab in a chart, annotated diagram, calculation, or concise result table. Explain the main finding, whether it matched your expectation, one source of error or uncertainty, and what experiment you would try next.` },
          ],
          project: "Practical Skills Showcase" },
        { key: "medium", label: "Medium: Applied Analysis", difficulty: "INTERMEDIATE" as const, taskDifficulty: "INTERMEDIATE" as const, weeks: 6,
          focus: "applied techniques and independent problem solving", points: 20,
          tasks: [
            { title: "Analyze a real use case", description: `Turn a real ${domain.name} use case into requirements and measurable acceptance criteria.`, instructions: `Select a realistic ${domain.name} scenario. Identify the user or stakeholder, problem, constraints, inputs, outputs, and at least four measurable acceptance criteria. Explain important assumptions and cite the sources or evidence behind them.` },
            { title: "Build a working prototype", description: `Create a focused ${domain.name} prototype that addresses the selected use case.`, instructions: `Build a prototype that addresses the use case and acceptance criteria from your analysis. Include the main workflow or process, representative sample data or materials, setup instructions, and a short demo or documented output. Explain key design choices.` },
            { title: "Validate the prototype", description: `Test the ${domain.name} prototype against its criteria and report the results.`, instructions: `Create a validation plan covering normal use, at least two edge cases, and each acceptance criterion. Run the checks, record expected versus actual results, fix or explain failures, and summarize limitations and next steps.` },
          ],
          project: "Applied Solution" },
        { key: "medium-build", label: "Medium: Integrated Build", difficulty: "INTERMEDIATE" as const, taskDifficulty: "INTERMEDIATE" as const, weeks: 6,
          focus: "combining domain techniques into a complete, tested deliverable", points: 20,
          tasks: [
            { title: "Plan the solution architecture", description: `Design how the major parts of an integrated ${domain.name} solution will work together.`, instructions: `Define the problem and draw an architecture or process diagram for your ${domain.name} solution. Label at least three components, their inputs and outputs, how information or materials move between them, and one key risk or dependency. Explain why this design fits the requirements.` },
            { title: "Implement and integrate components", description: `Build the core components and connect them into one ${domain.name} workflow.`, instructions: `Implement at least two components from your plan and demonstrate how they work together from input to output. Keep the repository organized, document setup and interfaces, and include a working example that a reviewer can follow.` },
            { title: "Verify end-to-end behavior", description: `Check the integrated ${domain.name} workflow against its acceptance criteria.`, instructions: `Create a traceability table linking each requirement to a verification step and result. Test the full workflow, include at least one failure or boundary case, record evidence, and explain any remaining gaps or trade-offs.` },
          ],
          project: "Integrated Domain Solution" },
        { key: "hard", label: "Hard: Industry Challenge", difficulty: "ADVANCED" as const, taskDifficulty: "ADVANCED" as const, weeks: 8,
          focus: "system design, tradeoffs, and a production-minded solution", points: 35,
          tasks: [
            { title: "Scope an industry problem", description: `Prepare a rigorous problem brief for a complex ${domain.name} challenge.`, instructions: `Choose a consequential ${domain.name} problem and define its stakeholders, operating context, constraints, and measurable success criteria. Compare at least two possible approaches, document assumptions and risks, and justify the approach you will pursue.` },
            { title: "Deliver an end-to-end solution", description: `Implement a complete ${domain.name} solution with documented operational and failure paths.`, instructions: `Build the end-to-end solution from the problem brief. Include the primary workflow, input validation or safety controls, error or failure handling, and reproducible setup. Document architecture decisions and demonstrate a representative end-to-end scenario.` },
            { title: "Benchmark and improve the solution", description: `Evaluate the ${domain.name} solution against measurable goals and recommend improvements.`, instructions: `Evaluate the solution against at least three measurable criteria relevant to ${domain.name}, such as accuracy, performance, reliability, cost, safety, or resource use. Record the method and results, analyze trade-offs and failure cases, make one evidence-based improvement, and present remaining risks.` },
          ],
          project: "Industry Challenge Capstone" },
      ];

      for (const track of tracks) {
        const programSlug = `internship-${domain.slug}-${track.key}`;
        const program = await prisma.internshipProgram.upsert({
          where: { slug: programSlug },
          update: {},
          create: {
            slug: programSlug,
            title: `${domain.name} Internship - ${track.label}`,
            domainId: domain.id,
            summary: `${track.label} ${domain.name} internship with three practical tasks and a guided capstone.`,
            description: `A free ${track.label.toLowerCase()}-level ${domain.name} internship. Learn through ${track.focus}, complete three mentor-reviewed tasks, and finish with a GitHub-hosted project suited to this level.`,
            durationWeeks: track.weeks,
            durationLabel: `${track.weeks} weeks`,
            mode: "ONLINE",
            difficulty: track.difficulty,
            skills: [domain.name],
            prerequisites: track.key === "easy" ? [] : [`Foundational knowledge of ${domain.name}`],
            learningOutcomes: [
              `Apply ${track.focus} in ${domain.name}`,
              "Complete three practical, reviewable tasks",
              `Build a ${track.label.toLowerCase()}-level capstone project`,
            ],
            certificateRequirements: "Complete the required tasks and have the final project approved to receive your free digital certificate.",
            isFree: true,
            status: "PUBLISHED",
            isFeatured: false,
            requiresFinalGithubLink: true,
            minTasksForCompletion: 3,
            publishedAt: new Date(),
          },
        });

        const domainsWithDeployableTasks = new Set([
          "software-development",
          "web-development",
          "full-stack-development",
          "mobile-development",
          "cloud-computing",
          "devops",
          "python",
          "java",
          "c-cpp",
          "artificial-intelligence",
          "machine-learning",
          "deep-learning",
          "data-science",
          "data-analytics",
          "generative-ai",
          "nlp",
          "computer-vision",
          "blockchain",
        ]);

        for (const [index, taskPlan] of track.tasks.entries()) {
          const slug = `${track.key}-${domain.slug}-${index + 1}`;
          const requiresLiveUrl = domainsWithDeployableTasks.has(domain.slug) && [
            "Build a working prototype",
            "Implement and integrate components",
            "Deliver an end-to-end solution",
          ].includes(taskPlan.title);
          const taskInstructions = `${taskPlan.instructions} ${requiresLiveUrl
            ? "Deploy the working app or service and submit BOTH its public GitHub repository URL and HTTPS live URL."
            : "Submit the public GitHub repository URL with your source code, documentation, and evidence. Deployment is not required for this task; a live URL is not needed."}`;
          const submissionType = requiresLiveUrl ? "LIVE_URL" as const : "GITHUB_LINK" as const;
          const existingTask = await prisma.task.findUnique({
            where: { programId_slug: { programId: program.id, slug } },
            select: { description: true, instructions: true },
          });
          const isSeedManagedTask = Boolean(
            existingTask?.instructions?.startsWith(`Create a focused ${domain.name} deliverable for this `)
            || existingTask?.instructions === taskPlan.instructions
            || existingTask?.instructions === taskInstructions,
          );
          await prisma.task.upsert({
            where: { programId_slug: { programId: program.id, slug } },
            update: isSeedManagedTask ? {
              title: `${track.label} ${domain.name}: ${taskPlan.title}`,
              description: taskPlan.description,
              instructions: taskInstructions,
              difficulty: track.taskDifficulty,
              submissionType,
              requiresGithubLink: true,
              maxAttempts: track.key === "hard" ? 2 : 3,
              points: track.points + index * 5,
              sortOrder: index + 1,
              status: "PUBLISHED",
            } : {},
            create: {
              programId: program.id,
              domainId: domain.id,
              title: `${track.label} ${domain.name}: ${taskPlan.title}`,
              slug,
              description: taskPlan.description,
              instructions: taskInstructions,
              difficulty: track.taskDifficulty,
              submissionType,
              requiresGithubLink: true,
              maxAttempts: track.key === "hard" ? 2 : 3,
              points: track.points + index * 5,
              sortOrder: index + 1,
              status: "PUBLISHED",
              publishedAt: new Date(),
            },
          });
        }

        const projectSlug = `${track.key}-capstone-${domain.slug}`;
        await prisma.project.upsert({
          where: { programId_slug: { programId: program.id, slug: projectSlug } },
          update: {},
          create: {
            programId: program.id,
            slug: projectSlug,
            title: `${track.label} ${domain.name}: ${track.project}`,
            description: `Design and deliver a ${track.label.toLowerCase()}-level ${domain.name} capstone. Demonstrate the skills from the internship, document key decisions, and publish the work in a public GitHub repository.`,
            requirements: [
              `A working ${domain.name} solution appropriate to the ${track.label.toLowerCase()} level`,
              "Public GitHub repository with source files or project documentation",
              "README explaining the problem, setup, usage, and design decisions",
              "Evidence of validation, testing, or measured results",
            ],
            skills: [domain.name],
            submissionMethod: "GITHUB_LINK",
            requiresGithubLink: true,
            requiresLiveUrl: false,
            isFinalProject: true,
            difficulty: track.difficulty,
            maxScore: 100,
            sortOrder: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
      }
    }

    // 4. Runtime settings ----------------------------------------------------
    for (const setting of APP_SETTINGS) {
      await prisma.appSetting.upsert({
        where: { key: setting.key },
        update: { valueType: setting.valueType, label: setting.label },
        create: {
          key: setting.key,
          valueJson: setting.value as never,
          valueType: setting.valueType,
          category: setting.category,
          label: setting.label,
          description: setting.description,
        },
      });
    }

    // 5. Homepage sections ---------------------------------------------------
    for (const section of HOMEPAGE_SECTIONS) {
      await prisma.homepageSection.upsert({
        where: { key: section.key },
        update: { title: section.title, subtitle: section.subtitle, sortOrder: section.sortOrder },
        create: {
          key: section.key,
          title: section.title,
          subtitle: section.subtitle,
          sortOrder: section.sortOrder,
          isEnabled: true,
        },
      });
    }

    // 6. FAQs (inserted once, then managed from the admin panel) -------------
    const faqCount = await prisma.faq.count();
    if (faqCount === 0) {
      await prisma.faq.createMany({
        data: FAQS.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          sortOrder: faq.sortOrder,
          isPublished: true,
        })),
      });
    }

    // 7. Transactional email templates ---------------------------------------
    for (const template of EMAIL_TEMPLATES) {
      await prisma.emailTemplate.upsert({
        where: { key: template.key },
        update: { name: template.name, subject: template.subject },
        create: {
          key: template.key,
          name: template.name,
          subject: template.subject,
          bodyHtml: template.html,
          bodyText: template.text,
        },
      });
    }

    // 8. Certificate templates -----------------------------------------------
    // Three distinct templates: Easy (standard), Medium (premium), Hard (hard).
    const templates = [
      { name: "default", version: 1, isActive: true, templateKey: "standard", primaryColor: process.env.PRIMARY_COLOR ?? "#4f46e5", secondaryColor: process.env.SECONDARY_COLOR ?? "#06b6d4", headerText: "Certificate of Completion", type: "plain" },
      { name: "premium", version: 1, isActive: false, templateKey: "premium", primaryColor: "#0f766e", secondaryColor: "#0369a1", headerText: "Premium Certificate", type: "decorated" },
      { name: "hard", version: 1, isActive: false, templateKey: "hard", primaryColor: "#b91c1c", secondaryColor: "#7f1d1d", headerText: "Hard Tier Certificate", type: "severe" },
    ];
    for (const template of templates) {
      const existingTemplate = await prisma.certificateTemplate.findFirst({ where: { name: template.name, version: template.version } });
      if (existingTemplate) continue;
      await prisma.certificateTemplate.create({
        data: {
          name: template.name,
          version: template.version,
          isActive: template.isActive,
          templateKey: template.templateKey,
          config: {
            orientation: "landscape",
            primaryColor: template.primaryColor,
            secondaryColor: template.secondaryColor,
            title: template.headerText,
            showQrCode: true,
            disclaimer: DEFAULT_CERTIFICATE_DISCLAIMER,
            type: template.type,
          },
        },
      });
    }


    // 9. Super administrator (only when explicitly configured) ---------------
    const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    let adminNote = "skipped (SEED_SUPER_ADMIN_EMAIL not set)";
    if (superAdminEmail) {
      const password = process.env.SEED_SUPER_ADMIN_PASSWORD?.trim();
      const passwordHash = password ? await hashPassword(password) : undefined;
      const adminUser = await prisma.user.upsert({
        where: { email: superAdminEmail },
        update: {
          name: process.env.SEED_SUPER_ADMIN_NAME ?? undefined,
          ...(passwordHash ? { passwordHash } : {}),
        },
        create: {
          email: superAdminEmail,
          name: process.env.SEED_SUPER_ADMIN_NAME ?? "Super Administrator",
          emailVerifiedAt: new Date(),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      const superAdminRoleId = roleIdByKey.get("SUPER_ADMIN");
      if (superAdminRoleId) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRoleId } },
          update: {},
          create: { userId: adminUser.id, roleId: superAdminRoleId },
        });
      }
      adminNote = `upserted ${superAdminEmail}`;
    }

    console.info("[seed] completed");
    console.info(
      `[seed] permissions=${PERMISSIONS.length} roles=${Object.keys(ROLE_MATRIX).length} domains=${domainTotal} programs=${allDomains.length * 5} tasks=${allDomains.length * 15} projects=${allDomains.length * 5} settings=${APP_SETTINGS.length} sections=${HOMEPAGE_SECTIONS.length} emailTemplates=${EMAIL_TEMPLATES.length}`,
    );
    console.info(`[seed] super admin: ${adminNote}`);
  } catch (error) {
    if (!isTransientDatabaseError(error) || attempt >= MAX_SEED_ATTEMPTS) {
      throw error;
    }
    shouldRetry = true;
  } finally {
    await disconnect();
  }

  if (shouldRetry) {
    const delayMs = retryDelayMs(attempt);
    console.warn(`[seed] transient database connection error; retrying full idempotent seed in ${delayMs}ms (attempt ${attempt + 1}/${MAX_SEED_ATTEMPTS})`);
    await wait(delayMs);
    return main(attempt + 1);
  }
}

main().catch((error: unknown) => {
  console.error("[seed] failed", error);
  process.exitCode = 1;
});
