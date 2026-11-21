import Link from "next/link";

import { PageHeader } from "@/components/dashboard/primitives";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = "space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground [&>li]:pl-1";

export default function StudentHelpPage() {
  return (
    <>
      <PageHeader
        title="Task and project guide"
        description="Follow these steps to understand an assignment, upload your work to GitHub, and submit the right links for review."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How to complete a task</CardTitle>
            <CardDescription>Use the instructions on the task page as your checklist.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className={steps}>
              <li>Read the task description and any extra instructions from start to finish.</li>
              <li>Check the Submit as details and note exactly what the form asks you to provide.</li>
              <li>Complete the work and save the files or results you need to share.</li>
              <li>Fill in the matching fields: repository link, live link, written answer, or a combination.</li>
              <li>Explain briefly what you did, what you learned, and any problem you had to solve.</li>
              <li>Submit for review, then check <Link className="font-medium text-primary underline" href="/student/submissions">Submissions</Link> for the status and mentor feedback.</li>
            </ol>
            <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Example explanation</p>
              <p className="mt-1 text-muted-foreground">I completed [what you built], used [tools or approach], and checked it by [how you tested it]. I learned [one thing].</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create a GitHub repository and upload files</CardTitle>
            <CardDescription>You can do this in your web browser; command-line Git is optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className={steps}>
              <li><a className="font-medium text-primary underline" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create a GitHub account</a> or sign in.</li>
              <li>Choose <strong className="text-foreground">New repository</strong>, give it a clear name, and select <strong className="text-foreground">Public</strong> so mentors can review it.</li>
              <li>Open the repository and choose <strong className="text-foreground">Add file</strong>, then <strong className="text-foreground">Upload files</strong>. Select or drag in your project files and folders.</li>
              <li>Enter a short message such as Add internship project, then commit the changes.</li>
              <li>Open the repository page and copy its address from the browser. It should look like <code className="break-all rounded bg-muted px-1">https://github.com/your-name/project-name</code>.</li>
              <li>Open that address in a private/incognito window. If you can see the files while signed out, the repository is public.</li>
            </ol>
            <a
              className="mt-4 inline-block text-sm font-medium text-primary underline"
              href="https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository"
              target="_blank"
              rel="noopener noreferrer"
            >
              See GitHub&apos;s file upload walkthrough
            </a>
            <Alert className="mt-4" variant="warning" title="Keep secrets private">
              Do not upload passwords, API keys, private student information, or files such as <code>.env</code> that contain secrets.
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Final project checklist</CardTitle>
            <CardDescription>Finish each step before you submit the project for verification.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className={steps}>
              <li>Choose one project from the Projects page and read its requirements.</li>
              <li>Build the project and check that it meets each listed requirement.</li>
              <li>Upload the source files to your own public GitHub repository.</li>
              <li>Add a README file that explains what the project does and how to open or run it.</li>
              <li>Deploy the project using a hosting service if a live demo is required. The live URL is the deployed website address, not the GitHub repository address.</li>
              <li>Submit both links on the project page: the GitHub repository and the live demo. Add notes that will help the reviewer run or understand your work.</li>
              <li>Check the submission status and read any mentor feedback. If changes are requested, update your work and resubmit.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What each link means</CardTitle>
            <CardDescription>Use the correct address in each submission field.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <div>
              <p className="font-medium">GitHub repository</p>
              <p className="text-muted-foreground">The page containing your source code and project files. Set it to public for mentor review.</p>
            </div>
            <div>
              <p className="font-medium">Live demo URL</p>
              <p className="text-muted-foreground">The address where someone can open and try your deployed project. A repository link does not count as a live demo.</p>
            </div>
            <div>
              <p className="font-medium">Task explanation</p>
              <p className="text-muted-foreground">A few sentences describing your approach, what you completed, and anything you want the mentor to know.</p>
            </div>
            <p className="border-t border-border pt-4 text-muted-foreground">
              Ready to continue? Go to <Link className="font-medium text-primary underline" href="/student/tasks">your tasks</Link> or <Link className="font-medium text-primary underline" href="/student/projects">your projects</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
