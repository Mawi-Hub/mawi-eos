-- CreateEnum
CREATE TYPE "plan_type" AS ENUM ('ANNUAL', 'SEMESTRAL');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "kpi_category" AS ENUM ('REVENUE', 'RETENTION', 'GROWTH', 'EFFICIENCY');

-- CreateEnum
CREATE TYPE "kpi_direction" AS ENUM ('ABOVE', 'BELOW');

-- CreateEnum
CREATE TYPE "kpi_source_type" AS ENUM ('MANUAL', 'CHARTMOGUL', 'HUBSPOT', 'POSTHOG');

-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('RECEIVED', 'REVIEWING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "milestone_status" AS ENUM ('PENDING', 'MET', 'MISSED');

-- AlterTable
ALTER TABLE "quarters" ADD COLUMN "plan_id" TEXT;

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "plan_type" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateTable
CREATE TABLE "plan_kpis" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "kpi_category" NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" "kpi_direction" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "source_type" "kpi_source_type" NOT NULL DEFAULT 'MANUAL',
    "source_key" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_kpis_plan_id_slug_key" ON "plan_kpis"("plan_id", "slug");

-- CreateTable
CREATE TABLE "plan_kpi_entries" (
    "id" TEXT NOT NULL,
    "kpi_id" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "projected" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_kpi_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_kpi_entries_kpi_id_period_key" ON "plan_kpi_entries"("kpi_id", "period");

-- CreateTable
CREATE TABLE "plan_proposals" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'RECEIVED',
    "submitted_at" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "resources" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_milestones" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_date" TIMESTAMP(3) NOT NULL,
    "status" "milestone_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_milestones_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "quarters" ADD CONSTRAINT "quarters_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_kpis" ADD CONSTRAINT "plan_kpis_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_kpis" ADD CONSTRAINT "plan_kpis_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_kpi_entries" ADD CONSTRAINT "plan_kpi_entries_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "plan_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
