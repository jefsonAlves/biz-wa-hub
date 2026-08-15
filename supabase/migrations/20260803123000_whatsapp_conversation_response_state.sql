-- Track inbox state without inspecting every message on each page load.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text,
  ADD COLUMN IF NOT EXISTS awaiting_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_agent_message_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_last_message_direction_check'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_last_message_direction_check
      CHECK (last_message_direction IS NULL OR last_message_direction IN ('incoming', 'outgoing'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS conversations_attention_idx
  ON public.conversations (tenant_id, awaiting_reply, unread_count, last_message_at DESC);

WITH latest AS (
  SELECT DISTINCT ON (message.conversation_id)
    message.conversation_id,
    message.direction,
    message.created_at
  FROM public.messages AS message
  ORDER BY message.conversation_id, message.created_at DESC, message.id DESC
)
UPDATE public.conversations AS conversation
SET last_message_direction = latest.direction,
    awaiting_reply = latest.direction = 'incoming',
    last_customer_message_at = CASE WHEN latest.direction = 'incoming' THEN latest.created_at ELSE conversation.last_customer_message_at END,
    last_agent_message_at = CASE WHEN latest.direction = 'outgoing' THEN latest.created_at ELSE conversation.last_agent_message_at END
FROM latest
WHERE latest.conversation_id = conversation.id;
