-- AlterTable: L10Meeting — add phase + preread_deadline
ALTER TABLE "l10_meetings" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'preread';
ALTER TABLE "l10_meetings" ADD COLUMN "preread_deadline" TIMESTAMP(3);

-- AlterTable: L10Issue — add link to Rock/Metric + submittedAt
ALTER TABLE "l10_issues" ADD COLUMN "linked_rock_id" TEXT;
ALTER TABLE "l10_issues" ADD COLUMN "linked_metric_id" TEXT;
ALTER TABLE "l10_issues" ADD COLUMN "submitted_at" TIMESTAMP(3);

-- CreateTable: L10PreReadRead
CREATE TABLE "l10_preread_reads" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "l10_preread_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "l10_preread_reads_meeting_id_user_id_key" ON "l10_preread_reads"("meeting_id", "user_id");

-- CreateTable: L10Annotation
CREATE TABLE "l10_annotations" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "l10_annotations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "l10_annotations_meeting_id_target_type_target_id_idx" ON "l10_annotations"("meeting_id", "target_type", "target_id");

-- CreateTable: L10IssueVote
CREATE TABLE "l10_issue_votes" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "l10_issue_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "l10_issue_votes_issue_id_user_id_key" ON "l10_issue_votes"("issue_id", "user_id");

-- CreateTable: L10Coverage
CREATE TABLE "l10_coverages" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "coverage_type" TEXT NOT NULL,
    "issue_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "l10_coverages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "l10_coverages_meeting_id_source_type_source_id_key" ON "l10_coverages"("meeting_id", "source_type", "source_id");

-- AddForeignKey: L10Issue links
ALTER TABLE "l10_issues" ADD CONSTRAINT "l10_issues_linked_rock_id_fkey" FOREIGN KEY ("linked_rock_id") REFERENCES "rocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "l10_issues" ADD CONSTRAINT "l10_issues_linked_metric_id_fkey" FOREIGN KEY ("linked_metric_id") REFERENCES "scorecard_metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: L10PreReadRead
ALTER TABLE "l10_preread_reads" ADD CONSTRAINT "l10_preread_reads_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "l10_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "l10_preread_reads" ADD CONSTRAINT "l10_preread_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: L10Annotation
ALTER TABLE "l10_annotations" ADD CONSTRAINT "l10_annotations_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "l10_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "l10_annotations" ADD CONSTRAINT "l10_annotations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "l10_annotations" ADD CONSTRAINT "l10_annotations_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: L10IssueVote
ALTER TABLE "l10_issue_votes" ADD CONSTRAINT "l10_issue_votes_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "l10_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "l10_issue_votes" ADD CONSTRAINT "l10_issue_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: L10Coverage
ALTER TABLE "l10_coverages" ADD CONSTRAINT "l10_coverages_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "l10_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "l10_coverages" ADD CONSTRAINT "l10_coverages_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "l10_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "l10_coverages" ADD CONSTRAINT "l10_coverages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: existing in_progress meetings stay in 'ids' phase; upcoming stay in 'preread'
UPDATE "l10_meetings" SET "phase" = 'closed' WHERE "status" = 'completed';
UPDATE "l10_meetings" SET "phase" = 'ids' WHERE "status" = 'in_progress';

-- Backfill: mark existing issues as submitted at their creation time
UPDATE "l10_issues" SET "submitted_at" = "created_at" WHERE "submitted_at" IS NULL;
