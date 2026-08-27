-- Los challenges del check-in ahora se escriben como L10Issue, que ya tiene sus
-- propios linked_rock_id / linked_metric_id y es lo que la reunión renderiza.
-- Estas dos columnas quedaron sin lectores.
ALTER TABLE "wins_challenges" DROP CONSTRAINT IF EXISTS "wins_challenges_linked_rock_id_fkey";
ALTER TABLE "wins_challenges" DROP CONSTRAINT IF EXISTS "wins_challenges_linked_metric_id_fkey";
ALTER TABLE "wins_challenges" DROP COLUMN IF EXISTS "linked_rock_id";
ALTER TABLE "wins_challenges" DROP COLUMN IF EXISTS "linked_metric_id";
