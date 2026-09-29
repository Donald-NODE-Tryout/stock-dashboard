-- ==============================================================================
-- ENTERPRISE AUDIT ARCHIVE SYSTEM
-- Automatically logs any deleted record across 5 core entities:
-- 1. ledger (Stock Movements)
-- 2. product_master (Catalogue Models)
-- 3. employee_register (Staff Records)
-- 4. locations (Branch Master)
-- 5. dispatch_tickets (Logistics Tickets)
-- ==============================================================================

-- 1. Create the unified deleted records archive table
CREATE TABLE IF NOT EXISTS public.deleted_records_archive (
  archive_id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_data JSONB NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT,
  reason TEXT
);

-- Indexes for rapid filtering and audit queries
CREATE INDEX IF NOT EXISTS idx_deleted_archive_table ON public.deleted_records_archive(table_name);
CREATE INDEX IF NOT EXISTS idx_deleted_archive_record_id ON public.deleted_records_archive(record_id);
CREATE INDEX IF NOT EXISTS idx_deleted_archive_deleted_at ON public.deleted_records_archive(deleted_at DESC);

-- Enable RLS and grant service role / authenticated access
ALTER TABLE public.deleted_records_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access to deleted_records_archive"
  ON public.deleted_records_archive
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role full access to deleted_records_archive"
  ON public.deleted_records_archive
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Universal Trigger Function for Automatic Archiving on Deletion
CREATE OR REPLACE FUNCTION public.archive_deleted_record()
RETURNS TRIGGER AS $$
DECLARE
  rec_id TEXT;
  performed_by TEXT;
BEGIN
  -- Determine primary identifier based on table name
  IF TG_TABLE_NAME = 'ledger' THEN
    rec_id := COALESCE(OLD.entry_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'product_master' THEN
    rec_id := COALESCE(OLD.model_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'employee_register' THEN
    rec_id := COALESCE(OLD.employee_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'locations' THEN
    rec_id := COALESCE(OLD.location_id::text, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'dispatch_tickets' THEN
    rec_id := COALESCE(OLD.ticket_id, 'UNKNOWN');
  ELSE
    rec_id := 'UNKNOWN';
  END IF;

  -- Attempt to capture actor from Supabase auth JWT claims
  BEGIN
    performed_by := COALESCE(
      current_setting('request.jwt.claim.sub', true),
      current_setting('app.current_user', true),
      'SYSTEM'
    );
  EXCEPTION WHEN OTHERS THEN
    performed_by := 'SYSTEM';
  END;

  -- Skip if already archived within the last 5 seconds to prevent duplicate logging
  IF EXISTS (
    SELECT 1 FROM public.deleted_records_archive
    WHERE table_name = TG_TABLE_NAME
      AND record_id = rec_id
      AND deleted_at >= (NOW() - INTERVAL '5 seconds')
  ) THEN
    RETURN OLD;
  END IF;

  -- Insert snapshot of OLD row into archive
  INSERT INTO public.deleted_records_archive (
    table_name,
    record_id,
    deleted_data,
    deleted_at,
    deleted_by
  ) VALUES (
    TG_TABLE_NAME,
    rec_id,
    to_jsonb(OLD),
    NOW(),
    performed_by
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach Deletion Triggers to all 5 Tables

-- Table 1: ledger
DROP TRIGGER IF EXISTS trg_archive_deleted_ledger ON public.ledger;
CREATE TRIGGER trg_archive_deleted_ledger
  BEFORE DELETE ON public.ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_deleted_record();

-- Table 2: product_master
DROP TRIGGER IF EXISTS trg_archive_deleted_product ON public.product_master;
CREATE TRIGGER trg_archive_deleted_product
  BEFORE DELETE ON public.product_master
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_deleted_record();

-- Table 3: employee_register
DROP TRIGGER IF EXISTS trg_archive_deleted_employee ON public.employee_register;
CREATE TRIGGER trg_archive_deleted_employee
  BEFORE DELETE ON public.employee_register
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_deleted_record();

-- Table 4: locations
DROP TRIGGER IF EXISTS trg_archive_deleted_location ON public.locations;
CREATE TRIGGER trg_archive_deleted_location
  BEFORE DELETE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_deleted_record();

-- Table 5: dispatch_tickets
DROP TRIGGER IF EXISTS trg_archive_deleted_dispatch ON public.dispatch_tickets;
CREATE TRIGGER trg_archive_deleted_dispatch
  BEFORE DELETE ON public.dispatch_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_deleted_record();

COMMENT ON TABLE public.deleted_records_archive IS 'Enterprise Audit Archive preserving deleted rows across ledger, product_master, employee_register, locations, and dispatch_tickets.';
