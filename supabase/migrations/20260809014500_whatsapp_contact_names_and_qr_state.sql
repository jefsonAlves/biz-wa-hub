-- Normalize old WhatsApp contacts that were displayed as raw phone numbers.
-- The receiver now keeps real WhatsApp names when available and only creates
-- a friendly fallback when the provider does not send one.

UPDATE public.contacts
SET name = 'Cliente WhatsApp ' || right(regexp_replace(phone, '\D', '', 'g'), 4)
WHERE nullif(trim(phone), '') IS NOT NULL
  AND (
    name IS NULL
    OR trim(name) = ''
    OR regexp_replace(name, '\D', '', 'g') = regexp_replace(phone, '\D', '', 'g')
  );

-- Avoid leaving stale QR payloads around after failed/disconnected states.
UPDATE public.whatsapp_connections
SET metadata = '{}'::jsonb
WHERE status IN ('error', 'disconnected')
  AND metadata ? 'qr_code';
