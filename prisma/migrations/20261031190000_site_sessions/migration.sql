-- CreateTable
CREATE TABLE "site_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "site_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_sessions_token_hash_key" ON "site_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "site_sessions_user_id_idx" ON "site_sessions"("user_id");

-- CreateIndex
CREATE INDEX "site_sessions_expires_at_idx" ON "site_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "site_sessions" ADD CONSTRAINT "site_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant DML to the runtime role when it exists. The migration role owns the table.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kami_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_sessions TO kami_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE site_sessions_id_seq TO kami_app';
    END IF;
END $$;
