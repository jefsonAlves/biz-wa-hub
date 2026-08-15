DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe();
DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe(uuid);

CREATE FUNCTION public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
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
    c.tenant_id,
    c.name,
    c.phone_number,
    c.provider_type,
    c.status,
    c.qr_status,
    nullif(c.metadata ->> 'qr_code', '') AS qr_code,
    CASE
      WHEN nullif(c.metadata ->> 'qr_expires_at', '') IS NULL THEN NULL
      ELSE (c.metadata ->> 'qr_expires_at')::timestamptz
    END AS qr_expires_at,
    c.webhook_status,
    (c.credential_reference IS NOT NULL OR c.zapi_token IS NOT NULL) AS has_credentials,
    c.last_connected_at,
    c.last_disconnected_at,
    c.last_health_check_at,
    nullif(left(coalesce(c.connection_error, ''), 160), '') AS connection_error,
    c.created_at
  FROM public.whatsapp_connections c
  WHERE c.tenant_id = coalesce(_tenant_id, public.get_user_tenant_id())
    AND (
      public.has_role('super_admin'::public.app_role)
      OR public.can_access_connection(c.id)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO authenticated, service_role;
