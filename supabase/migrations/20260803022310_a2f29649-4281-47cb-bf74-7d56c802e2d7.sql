CREATE OR REPLACE FUNCTION public.get_department_metrics(_from timestamptz, _to timestamptz)
RETURNS TABLE(
  department_id uuid,
  department_name text,
  conversations_count bigint,
  messages_sent bigint,
  messages_received bigint,
  new_conversations bigint,
  new_inbound_conversations bigint,
  awaiting_response bigint,
  avg_wait_seconds numeric,
  max_wait_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH t AS (SELECT public.get_user_tenant_id() AS tid),
convs AS (
  SELECT c.id, c.department_id, c.created_at
  FROM public.conversations c, t
  WHERE c.tenant_id = t.tid
),
msgs AS (
  SELECT m.conversation_id, m.role, m.created_at, cv.department_id
  FROM public.messages m
  JOIN convs cv ON cv.id = m.conversation_id
  WHERE m.created_at >= _from AND m.created_at < _to
),
agg AS (
  SELECT department_id,
    count(DISTINCT conversation_id) AS conversations_count,
    count(*) FILTER (WHERE role IN ('agent','ai')) AS messages_sent,
    count(*) FILTER (WHERE role = 'contact') AS messages_received
  FROM msgs
  GROUP BY department_id
),
pairs AS (
  SELECT conversation_id, department_id,
    min(created_at) FILTER (WHERE role = 'contact') AS first_in,
    min(created_at) FILTER (WHERE role IN ('agent','ai')) AS first_out
  FROM msgs
  GROUP BY conversation_id, department_id
),
waits AS (
  SELECT department_id,
    count(*) FILTER (WHERE first_in IS NOT NULL) AS new_inbound_conversations,
    count(*) FILTER (WHERE first_in IS NOT NULL AND (first_out IS NULL OR first_out < first_in)) AS awaiting_response,
    avg(EXTRACT(epoch FROM (first_out - first_in))) FILTER (WHERE first_out IS NOT NULL AND first_in IS NOT NULL AND first_out > first_in) AS avg_wait_seconds,
    max(EXTRACT(epoch FROM (first_out - first_in))) FILTER (WHERE first_out IS NOT NULL AND first_in IS NOT NULL AND first_out > first_in) AS max_wait_seconds
  FROM pairs
  GROUP BY department_id
),
created AS (
  SELECT department_id, count(*) AS new_conversations
  FROM convs
  WHERE created_at >= _from AND created_at < _to
  GROUP BY department_id
),
keys AS (
  SELECT department_id FROM agg
  UNION SELECT department_id FROM waits
  UNION SELECT department_id FROM created
  UNION SELECT d.id FROM public.departments d, t WHERE d.tenant_id = t.tid
)
SELECT
  k.department_id,
  COALESCE(d.name, 'Sem setor') AS department_name,
  COALESCE(a.conversations_count, 0),
  COALESCE(a.messages_sent, 0),
  COALESCE(a.messages_received, 0),
  COALESCE(cr.new_conversations, 0),
  COALESCE(w.new_inbound_conversations, 0),
  COALESCE(w.awaiting_response, 0),
  ROUND(COALESCE(w.avg_wait_seconds, 0)::numeric, 1),
  ROUND(COALESCE(w.max_wait_seconds, 0)::numeric, 1)
FROM keys k
LEFT JOIN public.departments d ON d.id = k.department_id
LEFT JOIN agg a ON a.department_id IS NOT DISTINCT FROM k.department_id
LEFT JOIN waits w ON w.department_id IS NOT DISTINCT FROM k.department_id
LEFT JOIN created cr ON cr.department_id IS NOT DISTINCT FROM k.department_id
ORDER BY COALESCE(a.conversations_count, 0) DESC, COALESCE(d.name, 'Sem setor');
$$;

REVOKE ALL ON FUNCTION public.get_department_metrics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_department_metrics(timestamptz, timestamptz) TO authenticated;