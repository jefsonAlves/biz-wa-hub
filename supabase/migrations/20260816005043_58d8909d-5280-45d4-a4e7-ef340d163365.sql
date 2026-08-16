-- Phase 1: reliable, single-consumer leasing for the event outbox.
-- The five-minute lease allows recovery if an Edge Function invocation dies.
CREATE OR REPLACE FUNCTION public.claim_event_outbox(batch_size integer DEFAULT 25)
RETURNS SETOF public.event_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.event_outbox AS o
    WHERE o.next_retry_at <= now()
      AND o.status IN ('pending', 'processing')
    ORDER BY o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(batch_size, 100))
  ), claimed AS (
    UPDATE public.event_outbox AS o
    SET status = 'processing',
        next_retry_at = now() + interval '5 minutes'
    FROM candidates AS c
    WHERE o.id = c.id
    RETURNING o.*
  )
  SELECT * FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_event_outbox(integer) TO service_role;

COMMENT ON FUNCTION public.claim_event_outbox(integer) IS
  'Atomically leases due outbox rows for the service-role worker using SKIP LOCKED.';
