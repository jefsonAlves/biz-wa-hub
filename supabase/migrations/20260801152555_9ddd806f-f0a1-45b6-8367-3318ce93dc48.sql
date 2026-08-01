CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe()
RETURNS TABLE (
  id uuid, name text, phone_number text, provider_type public.provider_type,
  status text, qr_status text, webhook_status text, has_credentials boolean,
  last_connected_at timestamptz, last_disconnected_at timestamptz,
  last_health_check_at timestamptz, connection_error text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone_number, c.provider_type, c.status, c.qr_status,
         c.webhook_status,
         (c.credential_reference IS NOT NULL OR c.zapi_token IS NOT NULL) AS has_credentials,
         c.last_connected_at, c.last_disconnected_at, c.last_health_check_at,
         nullif(left(coalesce(c.connection_error,''), 160), '') AS connection_error,
         c.created_at
  FROM public.whatsapp_connections c
  WHERE c.tenant_id = public.get_user_tenant_id()
    AND public.can_access_connection(c.id);
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_connection(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_connection(uuid) TO authenticated, service_role;