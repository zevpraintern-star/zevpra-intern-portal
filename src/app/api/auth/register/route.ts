import { apiSuccess } from "@/lib/api/response";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { POLICY_VERSIONS } from "@/lib/config/constants";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmailNow } from "@/lib/email/email-service";
import { ConflictError, RateLimitError, ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { studentRegistrationSchema } from "@/lib/validation/student";

export const POST = route(async (req, _ctx, meta) => {
  const ipLimit = await consumeRateLimit(rateLimits.register(`ip:${meta.ipAddress}`));
  if (!ipLimit.allowed) throw new RateLimitError("Too many registration attempts. Please try again later.", ipLimit.retryAfterSeconds);

  const json = await req.json();
  const parsed = studentRegistrationSchema.parse(json);

  const preferredDomain = await getPrisma().domain.findFirst({
    where: { id: parsed.preferredDomainId, isActive: true },
    select: { id: true },
  });
  if (!preferredDomain) {
    throw new ValidationError("Choose an active internship domain.", [{ field: "preferredDomainId", message: "Choose an active internship domain." }]);
  }

  const ipAddress = meta.ipAddress;
  const userAgent = req.headers.get("user-agent") || undefined;
  const normalisedEmail = parsed.email.trim().toLowerCase();

  // Verify that the email was verified via OTP in the last 15 minutes
  const recentVerifiedOtp = await getPrisma().otpRequest.findFirst({
    where: {
      email: normalisedEmail,
      purpose: "STUDENT_REGISTER",
      consumedAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000),
      },
    },
    orderBy: { consumedAt: "desc" },
  });

  if (!recentVerifiedOtp) {
    throw new ValidationError("Email verification required. Please verify your email with OTP first.");
  }

  // Only a person who proved control of this email can consume its registration quota.
  const emailLimit = await consumeRateLimit(rateLimits.register(`email:${normalisedEmail}`));
  if (!emailLimit.allowed) throw new RateLimitError("Too many registration attempts for this email. Please try again later.", emailLimit.retryAfterSeconds);

  // Check if user already exists
  const existing = await getPrisma().user.findUnique({
    where: { email: normalisedEmail },
  });

  if (existing) {
    throw new ConflictError("An account with this email address already exists. Please sign in.");
  }

  // Fetch STUDENT role ID
  const studentRole = await getPrisma().role.findUnique({
    where: { key: "STUDENT" },
  });

  // Create User, StudentProfile, and UserRole in a transaction
  const now = new Date();
  const user = await getPrisma().$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalisedEmail,
        emailVerifiedAt: now,
        name: parsed.fullName,
        phone: parsed.mobile,
        status: "ACTIVE",
        lastLoginAt: now,
        lastLoginIp: ipAddress?.slice(0, 45),
      },
    });

    await tx.studentProfile.create({
      data: {
        userId: newUser.id,
        fullName: parsed.fullName,
        mobile: parsed.mobile,
        college: parsed.college,
        university: parsed.university,
        degree: parsed.degree,
        branch: parsed.branch,
        yearOfStudy: parsed.yearOfStudy,
        graduationYear: parsed.graduationYear,
        state: parsed.state,
        city: parsed.city,
        country: parsed.country,
        preferredDomainId: parsed.preferredDomainId,
        githubUrl: parsed.githubUrl,
        linkedinUrl: parsed.linkedinUrl,
        resumeFileId: parsed.resumeFileId,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        termsVersion: POLICY_VERSIONS.terms,
        privacyVersion: POLICY_VERSIONS.privacy,
      },
    });

    if (studentRole) {
      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleId: studentRole.id,
        },
      });
    }

    return newUser;
  });

  // Send Welcome Email
  try {
    await sendEmailNow({
      to: normalisedEmail,
      templateKey: "welcome",
      variables: {
        recipientName: parsed.fullName,
      },
      userId: user.id,
    });
  } catch {
    // Non-blocking
  }

  // Create session & set cookie
  const { token } = await createSession({
    userId: user.id,
    kind: "STUDENT",
    ipAddress,
    userAgent,
  });

  await setSessionCookie(token, "STUDENT");

  return apiSuccess(
    {
      message: "Registration successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    },
    { status: 201 },
  );
});

