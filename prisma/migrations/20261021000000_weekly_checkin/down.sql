-- Reversión de 20261021000000_weekly_checkin.
DROP TABLE IF EXISTS "weekly_summaries";
DROP TABLE IF EXISTS "team_checkins";
DROP TABLE IF EXISTS "team_checkin_invites";
ALTER TABLE "report_members" DROP COLUMN IF EXISTS "team_key";
