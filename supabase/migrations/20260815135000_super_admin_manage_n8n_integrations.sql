DROP POLICY IF EXISTS "n8n select by tenant" ON public.n8n_integrations;
DROP POLICY IF EXISTS "n8n manage by admin" ON public.n8n_integrations;

CREATE POLICY "n8n select by tenant or super admin"
ON public.n8n_integrations
FOR SELECT
TO authenticated
USING (
  public.has_role('super_admin'::public.app_role)
  OR tenant_id = public.get_user_tenant_id()
);

CREATE POLICY "n8n manage by tenant admin or super admin"
ON public.n8n_integrations
FOR ALL
TO authenticated
USING (
  public.has_role('super_admin'::public.app_role)
  OR (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role_in_tenant(tenant_id, 'tenant_admin'::public.app_role)
  )
)
WITH CHECK (
  public.has_role('super_admin'::public.app_role)
  OR (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role_in_tenant(tenant_id, 'tenant_admin'::public.app_role)
  )
);
