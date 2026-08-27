-- AlterTable
ALTER TABLE "wins_challenges" ADD COLUMN "linked_rock_id" TEXT;
ALTER TABLE "wins_challenges" ADD COLUMN "linked_metric_id" TEXT;

-- AddForeignKey
ALTER TABLE "wins_challenges" ADD CONSTRAINT "wins_challenges_linked_rock_id_fkey" FOREIGN KEY ("linked_rock_id") REFERENCES "rocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wins_challenges" ADD CONSTRAINT "wins_challenges_linked_metric_id_fkey" FOREIGN KEY ("linked_metric_id") REFERENCES "scorecard_metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
