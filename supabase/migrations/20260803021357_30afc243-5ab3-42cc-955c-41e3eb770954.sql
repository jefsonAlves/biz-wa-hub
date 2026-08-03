-- 1. Custom team roles per tenant with granular permissions
CREATE TABLE public.tenant_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_role app_role NOT NULL DEFAULT 'agent',
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_roles TO authenticated;
GRANT ALL ON public.tenant_roles TO service_role;

ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view roles of their tenant"
ON public.tenant_roles FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role('super_admin'));

CREATE POLICY "Admins can create roles"
ON public.tenant_roles FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE POLICY "Admins can update roles"
ON public.tenant_roles FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')))
WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE POLICY "Admins can delete non system roles"
ON public.tenant_roles FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND is_system = false AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE TRIGGER update_tenant_roles_updated_at
BEFORE UPDATE ON public.tenant_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. Link assignments of custom roles to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS tenant_role_id uuid REFERENCES public.tenant_roles(id) ON DELETE SET NULL;

-- 3. Effective permissions for the current user
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role IN ('super_admin','tenant_admin'))
      THEN ARRAY['*']::text[]
    ELSE COALESCE((
      SELECT array_agg(DISTINCT p)
      FROM public.user_roles ur
      JOIN public.tenant_roles tr ON tr.id = ur.tenant_role_id
      CROSS JOIN LATERAL unnest(tr.permissions) AS p
      WHERE ur.user_id = auth.uid()
    ), ARRAY[]::text[])
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- 4. Tenant-level AI attendance settings (preparation for AI answering)
CREATE TABLE public.ai_attendance_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'off',
  default_agent_id uuid REFERENCES public.agents_config(id) ON DELETE SET NULL,
  fallback_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  business_hours_only boolean NOT NULL DEFAULT false,
  first_contact_only boolean NOT NULL DEFAULT false,
  greeting_message text,
  handoff_keywords text[] NOT NULL DEFAULT '{}',
  max_auto_replies integer NOT NULL DEFAULT 5,
  response_delay_seconds integer NOT NULL DEFAULT 2,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_attendance_settings TO authenticated;
GRANT ALL ON public.ai_attendance_settings TO service_role;

ALTER TABLE public.ai_attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view AI settings of their tenant"
ON public.ai_attendance_settings FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role('super_admin'));

CREATE POLICY "Admins can insert AI settings"
ON public.ai_attendance_settings FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE POLICY "Admins can update AI settings"
ON public.ai_attendance_settings FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')))
WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE POLICY "Admins can delete AI settings"
ON public.ai_attendance_settings FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin')));

CREATE TRIGGER update_ai_attendance_settings_updated_at
BEFORE UPDATE ON public.ai_attendance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ai_attendance_settings
  ADD CONSTRAINT ai_attendance_mode_check CHECK (mode IN ('off','suggest','auto'));

-- 5. Seed default (system) roles for every existing tenant
INSERT INTO public.tenant_roles (tenant_id, name, description, base_role, permissions, is_system)
SELECT t.id, 'Agente', 'Atende conversas do WhatsApp', 'agent',
       ARRAY['inbox.view','inbox.reply','inbox.assign_self','contacts.view','contacts.edit','notes.manage','schedules.manage','reports.view'], true
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_roles (tenant_id, name, description, base_role, permissions, is_system)
SELECT t.id, 'Visualizador', 'Somente leitura', 'viewer',
       ARRAY['inbox.view','contacts.view','reports.view'], true
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;