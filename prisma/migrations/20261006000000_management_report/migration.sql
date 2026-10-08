-- Reporte de management: áreas, selección trimestral por métrica, evidencia de
-- check-ins, preparación de líderes y publicación al cerrar la reunión.
-- 100% aditiva: sin DROP ni cambios de tipo. Reversión en down.sql (misma carpeta).

-- AlterTable
ALTER TABLE "l10_commitments" ADD COLUMN     "accepted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "date_changes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "next_step" TEXT,
ADD COLUMN     "original_due_date" TIMESTAMP(3),
ADD COLUMN     "shareable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "l10_issues" ADD COLUMN     "shareable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shared_summary" TEXT;

-- AlterTable
ALTER TABLE "l10_meetings" ADD COLUMN     "close_origin" TEXT,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by_id" TEXT,
ADD COLUMN     "cut_at" TIMESTAMP(3),
ADD COLUMN     "period_end" TIMESTAMP(3),
ADD COLUMN     "period_start" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plan_kpis" ADD COLUMN     "scorecard_metric_id" TEXT;

-- AlterTable
ALTER TABLE "quarters" ADD COLUMN     "objective" TEXT;

-- AlterTable
ALTER TABLE "scorecard_entries" ADD COLUMN     "data_state" TEXT,
ADD COLUMN     "denominator" DOUBLE PRECISION,
ADD COLUMN     "formula_version" TEXT,
ADD COLUMN     "numerator" DOUBLE PRECISION,
ADD COLUMN     "provenance" TEXT;

-- AlterTable
ALTER TABLE "scorecard_metrics" ADD COLUMN     "aggregation" TEXT NOT NULL DEFAULT 'last',
ADD COLUMN     "percent_scale" TEXT NOT NULL DEFAULT '0-100';

-- AlterTable
ALTER TABLE "wins_challenges" ADD COLUMN     "highlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "report_areas" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "leader_id" TEXT,
    "alternate_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_members" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT NOT NULL,
    "slack_workspace_id" TEXT,
    "slack_user_id" TEXT,
    "identity_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_leader" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_quarter_configs" (
    "id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "principal_rock_id" TEXT,
    "report_owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_quarter_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarter_metric_selections" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "plan_kpi_id" TEXT,
    "scorecard_metric_id" TEXT,
    "proposal_key" TEXT,
    "display_label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "report_owner_id" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "definition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarter_metric_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel_id" TEXT,
    "message_ts" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "slack_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_evidence" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_ts" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "user_id" TEXT,
    "area_key" TEXT,
    "author_name" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL,
    "original_text" TEXT NOT NULL,
    "win" TEXT,
    "challenge" TEXT,
    "permalink" TEXT,
    "notion_page_id" TEXT,
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "deleted_at" TIMESTAMP(3),
    "shareable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkin_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leader_preps" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "leader_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "blocks" JSONB NOT NULL DEFAULT '{}',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leader_preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_reports" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'original',
    "parent_report_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "quarter_id" TEXT NOT NULL,
    "close_origin" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "cut_at" TIMESTAMP(3) NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'company',
    "channel" TEXT,
    "content" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "publish_requested" BOOLEAN NOT NULL DEFAULT false,
    "skip_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_deliveries" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "part_index" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "provider_channel" TEXT,
    "provider_message_id" TEXT,
    "thread_ts" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_areas_key_key" ON "report_areas"("key");

-- CreateIndex
CREATE INDEX "report_members_slack_user_id_idx" ON "report_members"("slack_user_id");

-- CreateIndex
CREATE INDEX "report_members_area_id_idx" ON "report_members"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "area_quarter_configs_quarter_id_area_id_key" ON "area_quarter_configs"("quarter_id", "area_id");

-- CreateIndex
CREATE INDEX "quarter_metric_selections_plan_id_quarter_id_idx" ON "quarter_metric_selections"("plan_id", "quarter_id");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_metric_selections_quarter_id_plan_kpi_id_key" ON "quarter_metric_selections"("quarter_id", "plan_kpi_id");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_metric_selections_quarter_id_scorecard_metric_id_key" ON "quarter_metric_selections"("quarter_id", "scorecard_metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_metric_selections_quarter_id_proposal_key_key" ON "quarter_metric_selections"("quarter_id", "proposal_key");

-- CreateIndex
CREATE UNIQUE INDEX "slack_events_event_id_key" ON "slack_events"("event_id");

-- CreateIndex
CREATE INDEX "checkin_evidence_period_start_idx" ON "checkin_evidence"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_evidence_channel_id_message_ts_key" ON "checkin_evidence"("channel_id", "message_ts");

-- CreateIndex
CREATE UNIQUE INDEX "leader_preps_meeting_id_area_id_key" ON "leader_preps"("meeting_id", "area_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_reports_meeting_id_version_key" ON "meeting_reports"("meeting_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "report_deliveries_idempotency_key_key" ON "report_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "report_deliveries_status_idx" ON "report_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "report_deliveries_report_id_destination_part_index_key" ON "report_deliveries"("report_id", "destination", "part_index");

-- AddForeignKey
ALTER TABLE "l10_meetings" ADD CONSTRAINT "l10_meetings_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_kpis" ADD CONSTRAINT "plan_kpis_scorecard_metric_id_fkey" FOREIGN KEY ("scorecard_metric_id") REFERENCES "scorecard_metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_areas" ADD CONSTRAINT "report_areas_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_areas" ADD CONSTRAINT "report_areas_alternate_id_fkey" FOREIGN KEY ("alternate_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_members" ADD CONSTRAINT "report_members_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "report_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_members" ADD CONSTRAINT "report_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_quarter_configs" ADD CONSTRAINT "area_quarter_configs_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_quarter_configs" ADD CONSTRAINT "area_quarter_configs_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "report_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_metric_selections" ADD CONSTRAINT "quarter_metric_selections_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_metric_selections" ADD CONSTRAINT "quarter_metric_selections_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_metric_selections" ADD CONSTRAINT "quarter_metric_selections_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "report_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_metric_selections" ADD CONSTRAINT "quarter_metric_selections_plan_kpi_id_fkey" FOREIGN KEY ("plan_kpi_id") REFERENCES "plan_kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_metric_selections" ADD CONSTRAINT "quarter_metric_selections_scorecard_metric_id_fkey" FOREIGN KEY ("scorecard_metric_id") REFERENCES "scorecard_metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_preps" ADD CONSTRAINT "leader_preps_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "l10_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_preps" ADD CONSTRAINT "leader_preps_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "report_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_preps" ADD CONSTRAINT "leader_preps_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_reports" ADD CONSTRAINT "meeting_reports_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "l10_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_deliveries" ADD CONSTRAINT "report_deliveries_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "meeting_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (no destructivo) -------------------------------------------------
-- Los acuerdos existentes conservan su fecha original y el estado del check.
UPDATE "l10_commitments" SET "original_due_date" = "due_date" WHERE "original_due_date" IS NULL;
UPDATE "l10_commitments" SET "status" = 'done' WHERE "done" = true;
-- Reuniones ya cerradas antes de este cambio: cierre de migración, nunca humano,
-- así que nada las publica al activar el flujo nuevo.
UPDATE "l10_meetings" SET "close_origin" = 'migration', "closed_at" = "updated_at"
  WHERE "status" = 'completed' AND "close_origin" IS NULL;
