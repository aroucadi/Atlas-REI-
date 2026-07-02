-- Migration: WORM (Write-Once-Read-Many) audit trail
-- Drop this file into prisma/migrations/<timestamp>_worm_audit_trail/migration.sql
-- after generating a placeholder migration with:
--   npx prisma migrate dev --create-only --name worm_audit_trail
-- then paste this in place of the auto-generated content.
--
-- IMPORTANT: Prisma's schema.prisma model for AuditLog should mark this table
-- as unmanaged for update/delete at the application layer too — see notes
-- at the bottom. This migration enforces it at the DB layer regardless of
-- what the app tries to do, which is the point.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add hash-chaining columns
-- ---------------------------------------------------------------------------

ALTER TABLE audit_logs
  ADD COLUMN previous_hash text,
  ADD COLUMN entry_hash text;

-- Backfill existing rows with a genesis chain so the trigger has a valid
-- previous_hash to reference for the first new row. Existing history is
-- hashed in insertion order (created_at, id as tiebreaker) but note: rows
-- inserted before this migration were NOT tamper-proof retroactively —
-- only rows from this point forward are cryptographically chained.
DO $$
DECLARE
  r RECORD;
  prev_hash text := repeat('0', 64); -- genesis hash
  computed_hash text;
BEGIN
  -- Check if table is empty
  IF NOT EXISTS (SELECT 1 FROM audit_logs) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, organization_id, workspace_id, actor_user_id, entity_type,
           entity_id, action, before_json, after_json, created_at
    FROM audit_logs
    ORDER BY created_at ASC, id ASC
  LOOP
    computed_hash := encode(
      digest(
        concat_ws('|',
          prev_hash,
          r.id::text,
          coalesce(r.organization_id::text, ''),
          coalesce(r.workspace_id::text, ''),
          coalesce(r.actor_user_id::text, ''),
          r.entity_type,
          r.entity_id,
          r.action,
          coalesce(r.before_json::text, ''),
          coalesce(r.after_json::text, ''),
          r.created_at::text
        ),
        'sha256'
      ),
      'hex'
    );

    UPDATE audit_logs
      SET previous_hash = prev_hash,
          entry_hash = computed_hash
      WHERE id = r.id;

    prev_hash := computed_hash;
  END LOOP;
END $$;

-- pgcrypto is already enabled per your MVP schema (used for gen_random_uuid),
-- but digest() lives in pgcrypto too — confirm it's available:
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE audit_logs
  ALTER COLUMN previous_hash SET NOT NULL,
  ALTER COLUMN entry_hash SET NOT NULL;

CREATE UNIQUE INDEX idx_audit_logs_entry_hash ON audit_logs (entry_hash);

-- ---------------------------------------------------------------------------
-- 2. BEFORE INSERT trigger: compute the hash chain
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_logs_chain_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  last_hash text;
BEGIN
  -- Lock the most recent row so concurrent inserts can't compute the same
  -- previous_hash and create a fork in the chain.
  SELECT entry_hash INTO last_hash
  FROM audit_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF last_hash IS NULL THEN
    last_hash := repeat('0', 64); -- genesis hash for the very first row ever
  END IF;

  NEW.previous_hash := last_hash;

  NEW.entry_hash := encode(
    digest(
      concat_ws('|',
        NEW.previous_hash,
        NEW.id::text,
        coalesce(NEW.organization_id::text, ''),
        coalesce(NEW.workspace_id::text, ''),
        coalesce(NEW.actor_user_id::text, ''),
        NEW.entity_type,
        NEW.entity_id,
        NEW.action,
        coalesce(NEW.before_json::text, ''),
        coalesce(NEW.after_json::text, ''),
        NEW.created_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_logs_chain_hash
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_chain_hash();

-- ---------------------------------------------------------------------------
-- 3. BEFORE UPDATE OR DELETE trigger: hard-block mutation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is WORM (write-once-read-many): % operations are not permitted. Row id: %',
    TG_OP,
    COALESCE(OLD.id::text, 'unknown')
  USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_logs_block_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER trg_audit_logs_block_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- ---------------------------------------------------------------------------
-- 4. Verification helper: walk the chain and confirm integrity
--    Call this from a scheduled job or compliance endpoint.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION verify_audit_chain()
RETURNS TABLE(is_valid boolean, first_broken_id uuid, detail text)
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  prev_hash text := repeat('0', 64);
  expected_hash text;
BEGIN
  FOR r IN
    SELECT id, organization_id, workspace_id, actor_user_id, entity_type,
           entity_id, action, before_json, after_json, created_at,
           previous_hash, entry_hash
    FROM audit_logs
    ORDER BY created_at ASC, id ASC
  LOOP
    IF r.previous_hash <> prev_hash THEN
      is_valid := false;
      first_broken_id := r.id;
      detail := 'previous_hash mismatch (chain break or reordering)';
      RETURN NEXT;
      RETURN;
    END IF;

    expected_hash := encode(
      digest(
        concat_ws('|',
          r.previous_hash, r.id::text,
          coalesce(r.organization_id::text, ''),
          coalesce(r.workspace_id::text, ''),
          coalesce(r.actor_user_id::text, ''),
          r.entity_type, r.entity_id, r.action,
          coalesce(r.before_json::text, ''),
          coalesce(r.after_json::text, ''),
          r.created_at::text
        ),
        'sha256'
      ),
      'hex'
    );

    IF expected_hash <> r.entry_hash THEN
      is_valid := false;
      first_broken_id := r.id;
      detail := 'entry_hash does not match recomputed hash (row tampered)';
      RETURN NEXT;
      RETURN;
    END IF;

    prev_hash := r.entry_hash;
  END LOOP;

  is_valid := true;
  first_broken_id := NULL;
  detail := 'chain intact';
  RETURN NEXT;
END;
$$;

COMMIT;
