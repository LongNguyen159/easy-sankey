ALTER TABLE "fixed_cost_templates" ADD COLUMN "envelope_id" TEXT
    REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
