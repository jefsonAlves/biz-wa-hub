-- 1. conversations: agent update restricted to own tenant
DROP POLICY IF EXISTS "Agent manages assigned conversations" ON public.conversations;
CREATE POLICY "Agent manages assigned conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND public.has_role_in_tenant(tenant_id, 'agent'::app_role)
  AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL)
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  AND public.has_role_in_tenant(tenant_id, 'agent'::app_role)
);

-- 2. internal_notes: authenticated only
DROP POLICY IF EXISTS "Agents manage notes" ON public.internal_notes;
DROP POLICY IF EXISTS "Super admin full access notes" ON public.internal_notes;
DROP POLICY IF EXISTS "Tenant admin manages notes" ON public.internal_notes;
DROP POLICY IF EXISTS "Tenant members view notes" ON public.internal_notes;

CREATE POLICY "Agents manage notes" ON public.internal_notes FOR ALL TO authenticated
USING (public.has_role_in_tenant(tenant_id, 'agent'::app_role))
WITH CHECK (public.has_role_in_tenant(tenant_id, 'agent'::app_role));
CREATE POLICY "Super admin full access notes" ON public.internal_notes FOR ALL TO authenticated
USING (public.has_role('super_admin'::app_role))
WITH CHECK (public.has_role('super_admin'::app_role));
CREATE POLICY "Tenant admin manages notes" ON public.internal_notes FOR ALL TO authenticated
USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role))
WITH CHECK (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));
CREATE POLICY "Tenant members view notes" ON public.internal_notes FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

-- 3. schedules: authenticated only + ownership for agents
DROP POLICY IF EXISTS "Agent manages own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Super admin full access schedules" ON public.schedules;
DROP POLICY IF EXISTS "Tenant admin manages schedules" ON public.schedules;
DROP POLICY IF EXISTS "Tenant members view schedules" ON public.schedules;

CREATE POLICY "Agent manages own schedules" ON public.schedules FOR ALL TO authenticated
USING (
  public.has_role_in_tenant(tenant_id, 'agent'::app_role)
  AND created_by_user_id = auth.uid()
)
WITH CHECK (
  public.has_role_in_tenant(tenant_id, 'agent'::app_role)
  AND created_by_user_id = auth.uid()
);
CREATE POLICY "Super admin full access schedules" ON public.schedules FOR ALL TO authenticated
USING (public.has_role('super_admin'::app_role))
WITH CHECK (public.has_role('super_admin'::app_role));
CREATE POLICY "Tenant admin manages schedules" ON public.schedules FOR ALL TO authenticated
USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role))
WITH CHECK (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));
CREATE POLICY "Tenant members view schedules" ON public.schedules FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

-- 4. ai_providers: authenticated only
DROP POLICY IF EXISTS "Super admin full access ai_providers" ON public.ai_providers;
DROP POLICY IF EXISTS "Tenant admin manages own ai_providers" ON public.ai_providers;
DROP POLICY IF EXISTS "Tenant members view ai_providers" ON public.ai_providers;

CREATE POLICY "Super admin full access ai_providers" ON public.ai_providers FOR ALL TO authenticated
USING (public.has_role('super_admin'::app_role))
WITH CHECK (public.has_role('super_admin'::app_role));
CREATE POLICY "Tenant admin manages own ai_providers" ON public.ai_providers FOR ALL TO authenticated
USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role))
WITH CHECK (public.has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));
CREATE POLICY "Tenant members view ai_providers" ON public.ai_providers FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

-- 5. metrics RPC: no anonymous execution
REVOKE EXECUTE ON FUNCTION public.get_department_metrics(timestamptz, timestamptz) FROM anon;