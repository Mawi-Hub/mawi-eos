-- CreateTable
CREATE TABLE "kpi_checkin_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'wins',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_checkin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_checkin_sessions_user_id_week_start_key" ON "kpi_checkin_sessions"("user_id", "week_start");

-- CreateIndex
CREATE INDEX "kpi_checkin_sessions_slack_channel_id_idx" ON "kpi_checkin_sessions"("slack_channel_id");

-- AddForeignKey
ALTER TABLE "kpi_checkin_sessions" ADD CONSTRAINT "kpi_checkin_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
