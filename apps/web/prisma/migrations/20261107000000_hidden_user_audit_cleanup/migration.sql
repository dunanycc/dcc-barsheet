-- Audit updates remain forbidden. Only audit rows related to a hidden account
-- may be deleted during the explicit transaction-local account cleanup.
CREATE OR REPLACE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cleanup_id text := current_setting('app.hidden_user_cleanup_id', true);
  cleanup_email text;
  refs text[];
BEGIN
  IF TG_OP = 'DELETE' AND cleanup_id IS NOT NULL AND cleanup_id <> '' THEN
    SELECT "normalizedEmail" INTO cleanup_email FROM "User"
      WHERE id = cleanup_id AND "hiddenAt" IS NOT NULL;
    IF FOUND THEN
      SELECT ARRAY[cleanup_id, cleanup_email]
        || ARRAY(SELECT id FROM "VolunteerProfile" WHERE "userId" = cleanup_id)
        || ARRAY(SELECT a.id FROM "ShiftAssignment" a
             LEFT JOIN "VolunteerProfile" p ON p.id = a."volunteerProfileId"
             WHERE a."userId" = cleanup_id OR p."userId" = cleanup_id)
        || ARRAY(SELECT id FROM "AccessRequest" WHERE "approvedUserId" = cleanup_id OR "normalizedEmail" = cleanup_email)
      INTO refs;
      IF OLD."actorUserId" = cleanup_id OR OLD."actorEmailSnapshot" = cleanup_email
        OR EXISTS (SELECT 1 FROM unnest(refs) AS ref(value)
          WHERE OLD."entityId" = ref.value
            OR strpos(OLD."previousData"::text, ref.value) > 0
            OR strpos(OLD."newData"::text, ref.value) > 0
            OR strpos(OLD."details"::text, ref.value) > 0)
      THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'AuditEvent records are immutable';
END;
$$;
