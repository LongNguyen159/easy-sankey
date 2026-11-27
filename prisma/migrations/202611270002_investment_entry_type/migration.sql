CREATE TABLE "new_finance_entries" (
    "month_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('income','expense','investment','tax')),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "amount" REAL NOT NULL CHECK ("amount" >= 0),
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    "category_id" TEXT,
    "parent_entry_id" TEXT,
    "is_fixed_cost" BOOLEAN,
    "demo" BOOLEAN,
    "last_edited_at_ms" BIGINT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "envelope_id" TEXT REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE,

    PRIMARY KEY ("month_id", "id"),
    CHECK ("category_id" IS NULL OR "parent_entry_id" IS NULL),
    CHECK ("type" IN ('expense','investment') OR ("category_id" IS NULL AND "parent_entry_id" IS NULL)),
    CONSTRAINT "finance_entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "finance_months" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "finance_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "finance_entries_month_id_parent_entry_id_fkey" FOREIGN KEY ("month_id", "parent_entry_id") REFERENCES "new_finance_entries" ("month_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

WITH RECURSIVE investment ("month_id", "id") AS (
    SELECT entry."month_id", entry."id" FROM "finance_entries" AS entry
    JOIN "categories" ON "categories"."id" = entry."category_id"
    WHERE entry."type" = 'expense' AND "categories"."classification" = 'INVESTMENT'
    UNION
    SELECT entry."month_id", entry."id" FROM "finance_entries" AS entry
    JOIN investment ON entry."parent_entry_id" = investment."id" AND entry."month_id" = investment."month_id"
    WHERE entry."type" = 'expense'
)
INSERT INTO "new_finance_entries" ("month_id", "id", "type", "name", "normalized_name", "amount", "position", "category_id", "parent_entry_id", "is_fixed_cost", "demo", "last_edited_at_ms", "revision", "envelope_id")
SELECT "month_id", "id", CASE WHEN ("month_id", "id") IN (SELECT "month_id", "id" FROM investment) THEN 'investment' ELSE "type" END, "name", "normalized_name", "amount", "position", "category_id", "parent_entry_id", "is_fixed_cost", "demo", "last_edited_at_ms", "revision", "envelope_id" FROM "finance_entries";

DROP TABLE "finance_entries";
ALTER TABLE "new_finance_entries" RENAME TO "finance_entries";
CREATE INDEX "finance_entries_month_id_position_idx" ON "finance_entries"("month_id", "position");
CREATE INDEX "finance_entries_month_id_parent_entry_id_idx" ON "finance_entries"("month_id", "parent_entry_id");
CREATE INDEX "finance_entries_category_id_idx" ON "finance_entries"("category_id");
CREATE UNIQUE INDEX "finance_entries_month_id_normalized_name_key" ON "finance_entries"("month_id", "normalized_name");

CREATE TABLE "new_fixed_cost_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL CHECK ("type" IN ('income','expense','investment','tax')),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "amount" REAL NOT NULL CHECK ("amount" >= 0),
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    "category_id" TEXT,
    "parent_template_id" TEXT,
    "is_fixed_cost" BOOLEAN,
    "demo" BOOLEAN,
    "last_edited_at_ms" BIGINT,
    "envelope_id" TEXT REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK ("category_id" IS NULL OR "parent_template_id" IS NULL),
    CHECK ("type" IN ('expense','investment') OR ("category_id" IS NULL AND "parent_template_id" IS NULL)),
    CONSTRAINT "fixed_cost_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fixed_cost_templates_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "new_fixed_cost_templates" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

WITH RECURSIVE investment ("id") AS (
    SELECT entry."id" FROM "fixed_cost_templates" AS entry
    JOIN "categories" ON "categories"."id" = entry."category_id"
    WHERE entry."type" = 'expense' AND "categories"."classification" = 'INVESTMENT'
    UNION
    SELECT entry."id" FROM "fixed_cost_templates" AS entry
    JOIN investment ON entry."parent_template_id" = investment."id"
    WHERE entry."type" = 'expense'
)
INSERT INTO "new_fixed_cost_templates" ("id", "type", "name", "normalized_name", "amount", "position", "category_id", "parent_template_id", "is_fixed_cost", "demo", "last_edited_at_ms", "envelope_id")
SELECT "id", CASE WHEN "id" IN (SELECT "id" FROM investment) THEN 'investment' ELSE "type" END, "name", "normalized_name", "amount", "position", "category_id", "parent_template_id", "is_fixed_cost", "demo", "last_edited_at_ms", "envelope_id" FROM "fixed_cost_templates";

DROP TABLE "fixed_cost_templates";
ALTER TABLE "new_fixed_cost_templates" RENAME TO "fixed_cost_templates";
CREATE UNIQUE INDEX "fixed_cost_templates_normalized_name_key" ON "fixed_cost_templates"("normalized_name");
CREATE INDEX "fixed_cost_templates_position_idx" ON "fixed_cost_templates"("position");
CREATE INDEX "fixed_cost_templates_category_id_idx" ON "fixed_cost_templates"("category_id");

ALTER TABLE "categories" DROP COLUMN "classification";
