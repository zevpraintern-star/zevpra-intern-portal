import { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { POLICY_VERSIONS } from "@/lib/config/constants";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmailNow } from "@/lib/email/email-service";
import { ConflictError, ValidationError } from "@/lib/api/errors";
import { studentRegistrationSchema } from "@/lib/validation/student";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = studentRegistrationSchema.parse(json);

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
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
  } catch (error) {
    return apiFailure(error);
  }
}

