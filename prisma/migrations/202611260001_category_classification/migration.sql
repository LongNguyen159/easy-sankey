ALTER TABLE "categories" ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'EXPENSE'
  CHECK ("classification" IN ('EXPENSE', 'INVESTMENT'));
