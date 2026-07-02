-- AlterTable
ALTER TABLE "document_extractions"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN "failure_detail_json" JSONB;
