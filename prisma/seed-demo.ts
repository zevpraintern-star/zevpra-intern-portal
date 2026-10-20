/**
 * Optional sample content for local development:  npm run db:seed:demo
 * Creates one published internship with tasks and projects so the whole student flow
 * can be tried immediately. Safe to run repeatedly. Never run this against production.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const domain = await prisma.domain.findFirst({ where: { slug: { contains: "python" } } }) ?? (await prisma.domain.findFirstOrThrow({ where: { isActive: true } }));
  const program = await prisma.internshipProgram.upsert({
    where: { slug: "python-development-internship" },
    update: {},
    create: {
      slug: "python-development-internship", title: "Python Development Internship", domainId: domain.id,
      summary: "Learn practical Python by building small tools, then ship a project of your own.",
      description: "Eight weeks of structured, hands-on tasks followed by a project you build in your own GitHub repository.",
      durationWeeks: 8, durationLabel: "8 Weeks", difficulty: "BEGINNER", status: "PUBLISHED", publishedAt: new Date(),
      skills: ["Python", "Git", "Problem solving"], prerequisites: ["Basic programming knowledge"],
      learningOutcomes: ["Write clean Python programs", "Use Git and GitHub", "Structure a small project"],
      certificateRequirements: "Complete all required tasks and have your final project verified.", isFeatured: true,
    },
  });
  const tasks = [
    ["Set up your environment", "Install Python and Git, create a GitHub repository and push a hello-world script.", "GITHUB_LINK"],
    ["Command-line calculator", "Build a calculator that supports +, -, *, / and handles bad input gracefully.", "GITHUB_LINK"],
    ["File organiser", "Write a script that sorts files in a folder into sub-folders by extension.", "GITHUB_LINK"],
    ["Reflection", "In your own words, explain what you learned and what was hardest.", "TEXT"],
  ] as const;
  for (const [index, [title, description, type]] of tasks.entries()) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.task.upsert({
      where: { programId_slug: { programId: program.id, slug } }, update: {},
      create: { programId: program.id, domainId: null, slug, title, description, submissionType: type, status: "PUBLISHED", publishedAt: new Date(), maxAttempts: 3, points: 10, sortOrder: index + 1 },
    });
  }
  const projects = [
    ["Expense tracker CLI", "Track income and expenses from the terminal and save them to a JSON file.", ["Reads and writes JSON", "Monthly summary command", "README with usage examples"]],
    ["Web scraper", "Collect headlines from a public site and export them to CSV.", ["Respects robots.txt", "Exports CSV", "Unit tests for the parser"]],
  ] as const;
  for (const [index, [title, description, requirements]] of projects.entries()) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.project.upsert({
      where: { programId_slug: { programId: program.id, slug } }, update: {}, create: { programId: program.id, slug, title, description, requirements: [...requirements], skills: ["Python"], status: "PUBLISHED", publishedAt: new Date(), sortOrder: index + 1, difficulty: "INTERMEDIATE" },
    });
  }
  console.log("[seed-demo] done:", program.title);
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
