-- CreateTable
CREATE TABLE "site_sync_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "claimed_discord_id" TEXT,
    "claimed_discord_username" TEXT,
    "claimed_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_sync_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_account_merges" (
    "id" SERIAL NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "discord_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_account_merges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_sync_codes_code_hash_key" ON "site_sync_codes"("code_hash");

-- CreateIndex
CREATE INDEX "site_sync_codes_user_id_status_idx" ON "site_sync_codes"("user_id", "status");

-- CreateIndex
CREATE INDEX "site_sync_codes_expires_at_idx" ON "site_sync_codes"("expires_at");

-- CreateIndex
CREATE INDEX "site_sync_codes_claimed_discord_id_idx" ON "site_sync_codes"("claimed_discord_id");

-- CreateIndex
CREATE INDEX "site_account_merges_to_user_id_idx" ON "site_account_merges"("to_user_id");

-- CreateIndex
CREATE INDEX "site_account_merges_created_at_idx" ON "site_account_merges"("created_at");

-- AddForeignKey
ALTER TABLE "site_sync_codes" ADD CONSTRAINT "site_sync_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
