CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, tenant_id uuid, name text, phone_number text, provider_type text, status text, qr_status text, qr_code text, qr_expires_at timestamp with time zone, webhook_status text, has_credentials boolean, last_connected_at timestamp with time zone, last_disconnected_at timestamp with time zone, last_health_check_at timestamp with time zone, connection_error text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_super_admin boolean := public.has_role('super_admin'::public.app_role);
    v_profile_tenant_id uuid;
BEGIN
    SELECT p.tenant_id INTO v_profile_tenant_id FROM public.profiles p WHERE p.user_id = v_user_id;

    RETURN QUERY
    SELECT
        wc.id,
        wc.tenant_id,
        wc.name::text,
        wc.phone_number::text,
        wc.provider_type::text,
        wc.status::text,
        COALESCE(NULLIF(wc.metadata->>'qr_status', ''), wc.qr_status)::text AS qr_status,
        (wc.metadata->>'qr_code')::text AS qr_code,
        (wc.metadata->>'qr_expires_at')::timestamptz AS qr_expires_at,
        COALESCE(NULLIF(wc.metadata->>'webhook_status', ''), wc.webhook_status)::text AS webhook_status,
        (wc.provider_token IS NOT NULL OR wc.metadata->>'session_id' IS NOT NULL OR wc.provider_session_id IS NOT NULL) AS has_credentials,
        wc.last_connected_at,
        wc.last_disconnected_at,
        wc.last_health_check_at,
        COALESCE(NULLIF(wc.metadata->>'connection_error', ''), wc.connection_error)::text AS connection_error,
        wc.created_at
    FROM public.whatsapp_connections wc
    WHERE
        CASE
            WHEN v_is_super_admin THEN (_tenant_id IS NULL OR wc.tenant_id = _tenant_id)
            ELSE wc.tenant_id = v_profile_tenant_id
        END
    ORDER BY wc.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_whatsapp_connections_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO service_role;