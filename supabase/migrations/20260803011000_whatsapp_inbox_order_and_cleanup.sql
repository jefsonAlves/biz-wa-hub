-- WhatsApp-like inbox ordering and conservative cleanup of local/demo data.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_inbox_order_idx
  ON public.conversations (tenant_id, is_pinned DESC, pinned_at DESC, last_message_at DESC);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_origin_verified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz;

-- Quarantine only contacts that have neither a WhatsApp identity nor any
-- provider-assigned message. Hiding is reversible and safer than deleting.
UPDATE public.contacts AS contact
SET whatsapp_origin_verified = false,
    quarantined_at = now()
WHERE nullif(trim(contact.wa_chat_id), '') IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    JOIN public.messages AS message ON message.conversation_id = conversation.id
    WHERE conversation.contact_id = contact.id
      AND (message.wa_message_id IS NOT NULL OR message.zapi_message_id IS NOT NULL)
  );

UPDATE public.contacts
SET whatsapp_origin_verified = true,
    quarantined_at = NULL
WHERE nullif(trim(wa_chat_id), '') IS NOT NULL;

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
