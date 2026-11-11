-- CreateTable
CREATE TABLE "socket_io_attachments" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" BYTEA NOT NULL,

    CONSTRAINT "socket_io_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "socket_io_attachments_created_at_idx" ON "socket_io_attachments"("created_at");
