-- Expose only QR presentation data through the safe RPC.
-- Credentials and secret references remain server-side.
DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe();
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe()
RETURNS TABLE (
  id uuid,
  name text,
  phone_number text,
  provider_type public.provider_type,
  status text,
  qr_status text,
  qr_code text,
  qr_expires_at timestamptz,
  webhook_status text,
  has_credentials boolean,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_health_check_at timestamptz,
  connection_error text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.phone_number,
    c.provider_type,
    c.status,
    c.qr_status,
    NULLIF(c.metadata->>'qr_code', '') AS qr_code,
    CASE
      WHEN COALESCE(c.metadata->>'qr_expires_at', '') = '' THEN NULL
      WHEN (c.metadata->>'qr_expires_at') ~ '^\d{4}-\d{2}-\d{2}T' THEN (c.metadata->>'qr_expires_at')::timestamptz
      ELSE NULL
    END AS qr_expires_at,
    c.webhook_status,
    (c.credential_reference IS NOT NULL OR c.zapi_token IS NOT NULL) AS has_credentials,
    c.last_connected_at,
    c.last_disconnected_at,
    c.last_health_check_at,
    NULLIF(left(COALESCE(c.connection_error, ''), 160), '') AS connection_error,
    c.created_at
  FROM public.whatsapp_connections c
  WHERE c.tenant_id = public.get_user_tenant_id();
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_connections_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() TO service_role;
