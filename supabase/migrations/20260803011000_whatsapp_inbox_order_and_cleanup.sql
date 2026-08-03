-- WhatsApp-like inbox ordering and conservative cleanup of local/demo data.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_inbox_order_idx
  ON public.conversations (tenant_id, is_pinned DESC, pinned_at DESC, last_message_at DESC);

-- Remove only contacts that have neither a WhatsApp identity nor any message
-- carrying an ID assigned by the WhatsApp provider. This targets demo/manual
-- records and preserves every contact proven to have come from WhatsApp.
DELETE FROM public.contacts AS contact
WHERE nullif(trim(contact.wa_chat_id), '') IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    JOIN public.messages AS message ON message.conversation_id = conversation.id
    WHERE conversation.contact_id = contact.id
      AND (message.wa_message_id IS NOT NULL OR message.zapi_message_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.set_conversation_pinned(
  target_conversation_id uuid,
  should_pin boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET is_pinned = should_pin,
      pinned_at = CASE WHEN should_pin THEN now() ELSE NULL END
  WHERE id = target_conversation_id
    AND public.is_tenant_member(tenant_id);
END;
$$;


