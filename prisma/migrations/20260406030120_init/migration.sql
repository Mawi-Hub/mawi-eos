-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarters" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_metrics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "target_value" TEXT,
    "target_numeric" DOUBLE PRECISION,
    "target_direction" TEXT NOT NULL DEFAULT 'above',
    "frequency" TEXT NOT NULL,
    "unit" TEXT,
    "calculation" TEXT,
    "data_source" TEXT NOT NULL DEFAULT 'manual',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecard_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_entries" (
    "id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "actual_value" DOUBLE PRECISION,
    "actual_display" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "entered_by_id" TEXT,
    "auto_synced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rocks" (
    "id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "done_criteria" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "risk" TEXT,
    "status" TEXT NOT NULL DEFAULT 'on_track',
    "final_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wins_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quarter_id" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "entry_type" TEXT NOT NULL DEFAULT 'win',
    "wins" TEXT,
    "result" TEXT,
    "key_challenge" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medio',
    "follow_up_action" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wins_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_sync_cache" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data_key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_sync_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "quarters_year_quarter_key" ON "quarters"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_entries_metric_id_period_start_key" ON "scorecard_entries"("metric_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "api_sync_cache_source_data_key_key" ON "api_sync_cache"("source", "data_key");

-- AddForeignKey
ALTER TABLE "scorecard_metrics" ADD CONSTRAINT "scorecard_metrics_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_entries" ADD CONSTRAINT "scorecard_entries_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "scorecard_metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_entries" ADD CONSTRAINT "scorecard_entries_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_entries" ADD CONSTRAINT "scorecard_entries_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rocks" ADD CONSTRAINT "rocks_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rocks" ADD CONSTRAINT "rocks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wins_challenges" ADD CONSTRAINT "wins_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wins_challenges" ADD CONSTRAINT "wins_challenges_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
