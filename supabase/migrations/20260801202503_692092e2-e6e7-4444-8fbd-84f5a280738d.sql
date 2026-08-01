-- 1. Storage: tenant-scoped media access
DROP POLICY IF EXISTS "Anyone can view media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;

CREATE POLICY "Tenant members can view media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND (
    public.has_role('super_admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  )
);

CREATE POLICY "Tenant members can upload media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
);

CREATE POLICY "Tenant members can update media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
)
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
);

CREATE POLICY "Tenant members can delete media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media'
  AND (
    public.has_role('super_admin'::app_role)
    OR (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  )
);

-- 2. SECURITY DEFINER function exposure
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_user_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role_in_tenant(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role_in_tenant(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_connection(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() TO authenticated, service_role;

-- 3. Agents cannot forge assignment data on insert
DROP POLICY IF EXISTS "Agent creates conversations" ON public.conversations;
CREATE POLICY "Agent creates conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (
  has_role_in_tenant(tenant_id, 'agent'::app_role)
  AND tenant_id = public.get_user_tenant_id()
  AND (assigned_agent_id IS NULL OR assigned_agent_id = auth.uid())
  AND (
    department_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = department_id AND d.tenant_id = conversations.tenant_id
    )
  )
  AND (
    whatsapp_connection_id IS NULL
    OR public.can_access_connection(whatsapp_connection_id)
  )
);

-- 4. Audit logs cannot be forged
DROP POLICY IF EXISTS "Super admin insert logs" ON public.system_logs;
CREATE POLICY "Members insert own logs"
ON public.system_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role('super_admin'::app_role)
    OR tenant_id = public.get_user_tenant_id()
  )
);