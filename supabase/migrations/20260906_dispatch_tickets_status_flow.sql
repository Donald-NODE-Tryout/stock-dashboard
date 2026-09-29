-- ====================================================================
-- MIGRATION: Align dispatch_tickets check constraint with 5-stage flow
-- Target Table: public.dispatch_tickets
-- Flow: INITIATED -> WAITING -> PACKING -> PACKED -> CLOSED
-- ====================================================================

-- 1. Drop existing restrictive check constraint
ALTER TABLE IF EXISTS dispatch_tickets 
  DROP CONSTRAINT IF EXISTS dispatch_tickets_ticket_status_check;

-- 2. Migrate legacy status values ('INITIAL', 'PENDING') to 'INITIATED'
UPDATE dispatch_tickets 
SET ticket_status = 'INITIATED' 
WHERE ticket_status IN ('INITIAL', 'PENDING') OR ticket_status IS NULL;

-- 3. Add the updated check constraint enforcing the 5 stages
-- Note: 'INITIAL' is included for seamless backward compatibility during rolling deployments
ALTER TABLE dispatch_tickets 
  ADD CONSTRAINT dispatch_tickets_ticket_status_check 
  CHECK (ticket_status IN ('INITIATED', 'WAITING', 'PACKING', 'PACKED', 'CLOSED', 'INITIAL'));

-- 4. Set the column default to 'INITIATED'
ALTER TABLE dispatch_tickets 
  ALTER COLUMN ticket_status SET DEFAULT 'INITIATED';

-- 5. Add helpful description
COMMENT ON COLUMN dispatch_tickets.ticket_status IS 'Sequential flow: INITIATED -> WAITING -> PACKING -> PACKED -> CLOSED';
