
BEGIN;

-- 1. Fix n8n_integrations RLS leak
DROP POLICY IF EXISTS "Users can read n8n status" ON public.n8n_integrations;
CREATE POLICY "Users can read n8n status" 
ON public.n8n_integrations 
FOR SELECT 
TO authenticated 
USING (
  (status = 'active' AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())) 
  OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role))
);

-- 2. Secure functions by OID in PL/pgSQL
DO $$
BEGIN
  -- has_role (OID: 17542)
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role';
  EXECUTE 'ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public';

  -- For others, we find OID first to be safe
  EXECUTE (
    SELECT 'ALTER FUNCTION public.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ') SET search_path = public'
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' 
    AND p.proname IN ('has_role_in_tenant', 'get_user_tenant_id', 'get_whatsapp_connections_safe')
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error securing functions: %', SQLERRM;
END $$;

COMMIT;
