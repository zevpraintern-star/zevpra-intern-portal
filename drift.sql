node.exe : Loaded Prisma config from prisma7.config.ts.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (Loaded Prisma c...sma7.config.ts.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 

-- DropForeignKey
ALTER TABLE "project_submission_files" DROP CONSTRAINT "project_submission_files_file_id_fkey";

-- DropForeignKey
ALTER TABLE "project_submission_files" DROP CONSTRAINT "project_submission_files_project_submission_id_fkey";

-- DropForeignKey
ALTER TABLE "task_submission_files" DROP CONSTRAINT "task_submission_files_file_id_fkey";

-- DropForeignKey
ALTER TABLE "task_submission_files" DROP CONSTRAINT "task_submission_files_task_submission_id_fkey";

-- AlterTable
ALTER TABLE "certificate_templates" ADD COLUMN     "template_key" VARCHAR(60);

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "project_difficulty" "DifficultyLevel" NOT NULL;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'BEGINNER';

-- DropTable
DROP TABLE "project_submission_files";

-- DropTable
DROP TABLE "task_submission_files";

