-- Migration: super_admin_whatsapp_connections_by_tenant
-- Created: 2026-08-15 13:30:00

DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe();
DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe(uuid);
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    name text,
    phone_number text,
    provider_type text,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_super_admin boolean := public.has_role(v_user_id, 'super_admin');
    v_profile_tenant_id uuid;
BEGIN
    SELECT p.tenant_id INTO v_profile_tenant_id FROM public.profiles p WHERE p.user_id = v_user_id;

    RETURN QUERY
    SELECT 
        wc.id,
        wc.tenant_id,
        wc.name,
        wc.phone_number,
        wc.provider_type,
        wc.status,
        (wc.metadata->>'qr_status')::text as qr_status,
        (wc.metadata->>'qr_code')::text as qr_code,
        (wc.metadata->>'qr_expires_at')::timestamptz as qr_expires_at,
        (wc.metadata->>'webhook_status')::text as webhook_status,
        (wc.provider_token IS NOT NULL OR wc.metadata->>'session_id' IS NOT NULL) as has_credentials,
        wc.last_connected_at,
        wc.last_disconnected_at,
        wc.last_health_check_at,
        (wc.metadata->>'connection_error')::text as connection_error,
        wc.created_at
    FROM public.whatsapp_connections wc
    WHERE 
        CASE 
            WHEN v_is_super_admin THEN 
                (_tenant_id IS NULL OR wc.tenant_id = _tenant_id)
            ELSE 
                wc.tenant_id = v_profile_tenant_id
        END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO service_role;
