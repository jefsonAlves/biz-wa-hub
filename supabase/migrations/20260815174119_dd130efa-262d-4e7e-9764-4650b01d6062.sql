-- Cleanup duplicate functions and ensure Super Admin support for WhatsApp connections

-- 1. Drop the old no-argument version
DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe();

-- 2. Recreate the version with _tenant_id to be robust
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
    id uuid, 
    tenant_id uuid, 
    name text, 
    phone_number text, 
    provider_type text, 
    status text, 
    qr_status text, 
    qr_code text, 
    qr_expires_at timestamp with time zone, 
    webhook_status text, 
    has_credentials boolean, 
    last_connected_at timestamp with time zone, 
    last_disconnected_at timestamp with time zone, 
    last_health_check_at timestamp with time zone, 
    connection_error text, 
    created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
        wc.name,
        wc.phone_number,
        wc.provider_type,
        wc.status,
        (wc.metadata->>'qr_status')::text as qr_status,
        (wc.metadata->>'qr_code')::text as qr_code,
        (wc.metadata->>'qr_expires_at')::timestamptz as qr_expires_at,
        (wc.metadata->>'webhook_status')::text as webhook_status,
        (wc.provider_token IS NOT NULL OR wc.metadata->>'session_id' IS NOT NULL OR wc.provider_session_id IS NOT NULL) as has_credentials,
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
        END
    ORDER BY wc.created_at DESC;
END;
$$;

-- 3. Ensure Super Admin can manage whatsapp_connections via RLS
DROP POLICY IF EXISTS "Super admins can manage all whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "Super admins can manage all whatsapp_connections"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (public.has_role('super_admin'::public.app_role))
WITH CHECK (public.has_role('super_admin'::public.app_role));

-- 4. Ensure Super Admin can manage n8n_integrations via RLS
DROP POLICY IF EXISTS "Super admins can manage all n8n_integrations" ON public.n8n_integrations;
CREATE POLICY "Super admins can manage all n8n_integrations"
ON public.n8n_integrations
FOR ALL
TO authenticated
USING (public.has_role('super_admin'::public.app_role))
WITH CHECK (public.has_role('super_admin'::public.app_role));

-- 5. Grant permissions to authenticated users to call the RPC
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe(uuid) TO authenticated;
