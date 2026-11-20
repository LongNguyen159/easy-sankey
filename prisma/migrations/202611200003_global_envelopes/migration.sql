-- Null month membership makes an envelope reusable across all months.
CREATE TABLE "new_envelopes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month_id" TEXT,
    "name" TEXT NOT NULL CHECK (length(trim("name")) > 0),
    "budget" REAL NOT NULL CHECK ("budget" > 0),
    "position" INTEGER NOT NULL,
    CONSTRAINT "envelopes_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "finance_months" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_envelopes" SELECT * FROM "envelopes";
DROP TABLE "envelopes";
ALTER TABLE "new_envelopes" RENAME TO "envelopes";
CREATE INDEX "envelopes_month_id_position_idx" ON "envelopes"("month_id", "position");
