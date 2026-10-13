import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField } from "@/components/forms/file-field";
import { SelectField, TextField } from "@/components/forms/fields";
import { PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { updateProfileAction } from "@/app/student/actions";

export default async function ProfilePage() {
  const student = await requireStudentPage();
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId: student.userId }, include: { resumeFile: { select: { originalName: true } } } });
  if (!profile) return <PageHeader title="Profile" description="Your profile could not be found." />;
  const years = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }));
  return (
    <>
      <PageHeader title="My profile" description={`Signed in as ${student.email}. Your email cannot be changed.`} />
      <Card><CardContent className="pt-6">
        <ActionForm action={updateProfileAction} className="grid gap-5 sm:grid-cols-2">
          <TextField label="Full name" name="fullName" defaultValue={profile.fullName} required />
          <TextField label="Mobile number" name="mobile" defaultValue={profile.mobile} required inputMode="tel" />
          <TextField label="College" name="college" defaultValue={profile.college} required />
          <TextField label="University" name="university" defaultValue={profile.university ?? ""} />
          <TextField label="Degree" name="degree" defaultValue={profile.degree} required />
          <TextField label="Branch" name="branch" defaultValue={profile.branch} required />
          <SelectField label="Year of study" name="yearOfStudy" defaultValue={String(profile.yearOfStudy)} options={years} />
          <TextField label="Graduation year" name="graduationYear" defaultValue={String(profile.graduationYear)} inputMode="numeric" required />
          <TextField label="State" name="state" defaultValue={profile.state ?? ""} />
          <TextField label="City" name="city" defaultValue={profile.city ?? ""} />
          <TextField label="Country" name="country" defaultValue={profile.country} />
          <TextField label="GitHub profile" name="githubUrl" defaultValue={profile.githubUrl ?? ""} placeholder="https://github.com/username" />
          <TextField label="LinkedIn profile" name="linkedinUrl" defaultValue={profile.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/username" />
          <div className="sm:col-span-2"><FileField label="Resume (PDF)" name="resumeFileId" purpose="RESUME" accept="application/pdf" hint={profile.resumeFile ? `Current: ${profile.resumeFile.originalName}` : "Optional"} /></div>
          <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div>
        </ActionForm>
      </CardContent></Card>
    </>
  );
}
