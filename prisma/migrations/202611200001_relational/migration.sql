-- CreateTable
CREATE TABLE "finance_months" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "last_updated" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "color_light" TEXT,
    "color_dark" TEXT,
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    "is_essential" BOOLEAN NOT NULL DEFAULT false,
    "budget_position" INTEGER
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "month_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('income','expense','tax')),
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

    PRIMARY KEY ("month_id", "id"),
    CHECK ("category_id" IS NULL OR "parent_entry_id" IS NULL),
    CHECK ("type" = 'expense' OR ("category_id" IS NULL AND "parent_entry_id" IS NULL)),
    CONSTRAINT "finance_entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "finance_months" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "finance_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "finance_entries_month_id_parent_entry_id_fkey" FOREIGN KEY ("month_id", "parent_entry_id") REFERENCES "finance_entries" ("month_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "fixed_cost_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL CHECK ("type" IN ('income','expense','tax')),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "amount" REAL NOT NULL CHECK ("amount" >= 0),
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    "category_id" TEXT,
    "parent_template_id" TEXT,
    "is_fixed_cost" BOOLEAN,
    "demo" BOOLEAN,
    "last_edited_at_ms" BIGINT,
    CHECK ("category_id" IS NULL OR "parent_template_id" IS NULL),
    CHECK ("type" = 'expense' OR ("category_id" IS NULL AND "parent_template_id" IS NULL)),
    CONSTRAINT "fixed_cost_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fixed_cost_templates_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "fixed_cost_templates" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "budgets" (
    "position" INTEGER NOT NULL DEFAULT 0,
    "category_id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL CHECK ("amount" >= 0),
    CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracking_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category_id" TEXT,
    "subject_label" TEXT,
    "target_amount" REAL NOT NULL,
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    CHECK (("category_id" IS NULL) <> ("subject_label" IS NULL)),
    CONSTRAINT "tracking_targets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracking_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "target_surplus" REAL NOT NULL DEFAULT 0,
    "average_income" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "finance_entry_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL CHECK ("position" >= 0),
    "timestamp_text" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" REAL,
    CHECK (("value_text" IS NULL) <> ("value_number" IS NULL)),
    CONSTRAINT "finance_entry_history_month_id_entry_id_fkey" FOREIGN KEY ("month_id", "entry_id") REFERENCES "finance_entries" ("month_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "selected_currency" TEXT,
    "entry_view" TEXT,
    "budget_view" TEXT,
    "budget_sort" TEXT,
    "fixed_cost_sort" TEXT,
    "theme_mode" TEXT,
    "is_dark_mode" BOOLEAN,
    "manual_theme_set" BOOLEAN,
    "first_time" BOOLEAN,
    "app_version" TEXT
);

-- CreateTable
CREATE TABLE "import_state" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "local_storage_import_completed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "source_format" TEXT
);

-- CreateIndex
CREATE INDEX "finance_entries_month_id_position_idx" ON "finance_entries"("month_id", "position");

-- CreateIndex
CREATE INDEX "finance_entries_month_id_parent_entry_id_idx" ON "finance_entries"("month_id", "parent_entry_id");

-- CreateIndex
CREATE INDEX "finance_entries_category_id_idx" ON "finance_entries"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_month_id_normalized_name_key" ON "finance_entries"("month_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_cost_templates_normalized_name_key" ON "fixed_cost_templates"("normalized_name");

-- CreateIndex
CREATE INDEX "fixed_cost_templates_position_idx" ON "fixed_cost_templates"("position");

-- CreateIndex
CREATE INDEX "fixed_cost_templates_category_id_idx" ON "fixed_cost_templates"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_targets_category_id_key" ON "tracking_targets"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_targets_subject_label_key" ON "tracking_targets"("subject_label");

-- CreateIndex
CREATE INDEX "tracking_targets_position_idx" ON "tracking_targets"("position");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entry_history_month_id_entry_id_position_key" ON "finance_entry_history"("month_id", "entry_id", "position");

