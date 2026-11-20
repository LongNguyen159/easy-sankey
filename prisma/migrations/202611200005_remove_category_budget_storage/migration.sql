-- Spending limits belong to envelopes (displayed as budgets), never categories.
-- Finance entries, categories, templates and history are unaffected.
DROP TABLE "budgets";
ALTER TABLE "categories" DROP COLUMN "budget_position";
ALTER TABLE "app_settings" DROP COLUMN "budget_view";
ALTER TABLE "app_settings" DROP COLUMN "budget_sort";
