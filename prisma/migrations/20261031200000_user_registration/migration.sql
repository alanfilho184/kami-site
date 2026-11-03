-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ,
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ;
