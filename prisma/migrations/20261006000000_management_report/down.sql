-- Reversión de 20261006000000_management_report. Se ejecuta a mano:
--   psql "$DATABASE_URL" -f prisma/migrations/20261006000000_management_report/down.sql
-- y luego: prisma migrate resolve --rolled-back 20261006000000_management_report
-- Borra solo lo que esta migración creó. Las respuestas, métricas, entradas y
-- publicaciones registradas durante el piloto en las tablas nuevas se pierden;
-- hacer un respaldo antes si se quieren conservar (pg_dump -t report_* -t meeting_reports ...).
-- Las tablas y columnas previas no se tocan.

DROP TABLE IF EXISTS "report_deliveries";
DROP TABLE IF EXISTS "meeting_reports";
DROP TABLE IF EXISTS "leader_preps";
DROP TABLE IF EXISTS "checkin_evidence";
DROP TABLE IF EXISTS "slack_events";
DROP TABLE IF EXISTS "quarter_metric_selections";
DROP TABLE IF EXISTS "area_quarter_configs";
DROP TABLE IF EXISTS "report_members";
DROP TABLE IF EXISTS "report_areas";

ALTER TABLE "wins_challenges" DROP COLUMN IF EXISTS "highlighted", DROP COLUMN IF EXISTS "shareable";
ALTER TABLE "scorecard_metrics" DROP COLUMN IF EXISTS "aggregation", DROP COLUMN IF EXISTS "percent_scale";
ALTER TABLE "scorecard_entries"
  DROP COLUMN IF EXISTS "data_state", DROP COLUMN IF EXISTS "numerator", DROP COLUMN IF EXISTS "denominator",
  DROP COLUMN IF EXISTS "formula_version", DROP COLUMN IF EXISTS "provenance";
ALTER TABLE "quarters" DROP COLUMN IF EXISTS "objective";
ALTER TABLE "plan_kpis" DROP CONSTRAINT IF EXISTS "plan_kpis_scorecard_metric_id_fkey", DROP COLUMN IF EXISTS "scorecard_metric_id";
ALTER TABLE "l10_meetings" DROP CONSTRAINT IF EXISTS "l10_meetings_closed_by_id_fkey",
  DROP COLUMN IF EXISTS "close_origin", DROP COLUMN IF EXISTS "closed_at", DROP COLUMN IF EXISTS "closed_by_id",
  DROP COLUMN IF EXISTS "cut_at", DROP COLUMN IF EXISTS "period_end", DROP COLUMN IF EXISTS "period_start",
  DROP COLUMN IF EXISTS "version";
ALTER TABLE "l10_issues" DROP COLUMN IF EXISTS "shareable", DROP COLUMN IF EXISTS "shared_summary";
ALTER TABLE "l10_commitments"
  DROP COLUMN IF EXISTS "accepted", DROP COLUMN IF EXISTS "date_changes", DROP COLUMN IF EXISTS "next_step",
  DROP COLUMN IF EXISTS "original_due_date", DROP COLUMN IF EXISTS "shareable", DROP COLUMN IF EXISTS "status";
