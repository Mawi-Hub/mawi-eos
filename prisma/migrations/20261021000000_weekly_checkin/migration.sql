-- Check-in semanal por equipo y resumen de empresa. 100% aditiva.

-- AlterTable
ALTER TABLE "report_members" ADD COLUMN "team_key" TEXT;

-- CreateTable
CREATE TABLE "team_checkin_invites" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "member_id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "dm_channel" TEXT NOT NULL,
    "message_ts" TEXT,
    "reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_checkin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_checkins" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "member_id" TEXT,
    "user_id" TEXT,
    "area_key" TEXT,
    "team_key" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "learning" TEXT NOT NULL,
    "extra" TEXT,
    "blocker" TEXT,
    "commitment" TEXT NOT NULL,
    "previous_commitment" TEXT,
    "previous_commitment_status" TEXT,
    "numbers" JSONB NOT NULL DEFAULT '[]',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "evidence_id" TEXT,
    "notion_page_id" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summaries" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draft_text" TEXT,
    "generated_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "hidden_items" JSONB NOT NULL DEFAULT '[]',
    "meeting_id" TEXT,
    "channel" TEXT,
    "slack_ts" TEXT,
    "permalink" TEXT,
    "sent_at" TIMESTAMP(3),
    "sent_by_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_checkin_invites_period_start_slack_user_id_key" ON "team_checkin_invites"("period_start", "slack_user_id");

-- CreateIndex
CREATE INDEX "team_checkins_period_start_idx" ON "team_checkins"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "team_checkins_period_start_slack_user_id_key" ON "team_checkins"("period_start", "slack_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_summaries_period_start_key" ON "weekly_summaries"("period_start");
