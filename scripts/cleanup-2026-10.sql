-- Limpieza de datos viejos acordada el 2026-10-21. Una sola transacción.
-- Correr desde la carpeta del repo con el .env de producción:
--   psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed 's/?.*//')" -f scripts/cleanup-2026-10.sql
-- Muestra lo que borra y al final hace COMMIT. Para solo mirar, cambiá el COMMIT final por ROLLBACK.

BEGIN;

-- A. Reuniones L10 vacías: sin issues, acuerdos, preparación ni reporte.
CREATE TEMP TABLE empty_meetings AS
SELECT m.id, m.date::date AS d, m.status FROM l10_meetings m
WHERE m.date::date IN ('2026-06-22', '2026-09-04', '2026-10-02', '2026-10-09', '2026-10-16')
  AND NOT EXISTS (SELECT 1 FROM l10_issues i WHERE i.meeting_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM l10_commitments c WHERE c.meeting_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM leader_preps p WHERE p.meeting_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM meeting_reports r WHERE r.meeting_id = m.id);
SELECT 'A · reunión vacía a borrar: ' || d || ' (' || status || ')' FROM empty_meetings ORDER BY d;
DELETE FROM l10_preread_reads WHERE meeting_id IN (SELECT id FROM empty_meetings);
DELETE FROM l10_annotations WHERE meeting_id IN (SELECT id FROM empty_meetings);
DELETE FROM l10_coverages WHERE meeting_id IN (SELECT id FROM empty_meetings);
DELETE FROM l10_meetings WHERE id IN (SELECT id FROM empty_meetings);

-- B. Conversaciones viejas del check-in de managers: se cierran (no se borran).
SELECT 'B · conversaciones abiertas a cerrar: ' || count(*) FROM kpi_checkin_sessions
 WHERE step <> 'done' AND week_start < date_trunc('week', now());
UPDATE kpi_checkin_sessions SET step = 'done', updated_at = now()
 WHERE step <> 'done' AND week_start < date_trunc('week', now());

-- C. Métricas inactivas que nunca tuvieron datos ni referencias.
CREATE TEMP TABLE dead_metrics AS
SELECT m.id, m.name FROM scorecard_metrics m
WHERE NOT m.is_active
  AND NOT EXISTS (SELECT 1 FROM scorecard_entries e WHERE e.metric_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM plan_kpis k WHERE k.scorecard_metric_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM quarter_metric_selections s WHERE s.scorecard_metric_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM l10_issues i WHERE i.linked_metric_id = m.id);
SELECT 'C · métrica a borrar: ' || name FROM dead_metrics;
DELETE FROM scorecard_metrics WHERE id IN (SELECT id FROM dead_metrics);

COMMIT;
