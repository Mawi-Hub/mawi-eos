-- Temas que se repiten en el check-in del equipo y su vínculo con IDS.
ALTER TABLE "weekly_summaries" ADD COLUMN "team_themes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "weekly_summaries" ADD COLUMN "themes_generated_at" TIMESTAMP(3);
ALTER TABLE "l10_issues" ADD COLUMN "team_theme_id" TEXT;
