CREATE TABLE "envelopes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month_id" TEXT NOT NULL,
    "name" TEXT NOT NULL CHECK (length(trim("name")) > 0),
    "budget" REAL NOT NULL CHECK ("budget" > 0),
    "position" INTEGER NOT NULL,
    CONSTRAINT "envelopes_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "finance_months" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "envelopes_month_id_position_idx" ON "envelopes"("month_id", "position");
ALTER TABLE "finance_entries" ADD COLUMN "envelope_id" TEXT REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
