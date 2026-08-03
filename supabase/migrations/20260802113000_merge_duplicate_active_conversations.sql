-- Keep one active inbox thread per contact and move all related history to it.
-- Closed conversations remain untouched so the audit/history model is preserved.

CREATE TEMP TABLE conversation_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY tenant_id, contact_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY tenant_id, contact_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id
    ) AS position
  FROM public.conversations
  WHERE status IN ('open', 'waiting')
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE position > 1;

UPDATE public.messages AS item
SET conversation_id = mapping.keeper_id
FROM conversation_merge_map AS mapping
WHERE item.conversation_id = mapping.duplicate_id;

UPDATE public.internal_notes AS item
SET conversation_id = mapping.keeper_id
FROM conversation_merge_map AS mapping
WHERE item.conversation_id = mapping.duplicate_id;

UPDATE public.schedules AS item
SET conversation_id = mapping.keeper_id
FROM conversation_merge_map AS mapping
WHERE item.conversation_id = mapping.duplicate_id;

UPDATE public.whatsapp_access_requests AS item
SET conversation_id = mapping.keeper_id
FROM conversation_merge_map AS mapping
WHERE item.conversation_id = mapping.duplicate_id;

WITH totals AS (
  SELECT
    mapping.keeper_id,
    sum(coalesce(duplicate.unread_count, 0)) AS unread_count,
    max(duplicate.last_message_at) AS last_message_at
  FROM conversation_merge_map AS mapping
  JOIN public.conversations AS duplicate ON duplicate.id = mapping.duplicate_id
  GROUP BY mapping.keeper_id
)
UPDATE public.conversations AS keeper
SET
  unread_count = coalesce(keeper.unread_count, 0) + totals.unread_count,
  last_message_at = greatest(keeper.last_message_at, totals.last_message_at)
FROM totals
WHERE keeper.id = totals.keeper_id;

DELETE FROM public.conversations AS duplicate
USING conversation_merge_map AS mapping
WHERE duplicate.id = mapping.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_per_contact_idx
ON public.conversations (tenant_id, contact_id)
WHERE status IN ('open', 'waiting');

