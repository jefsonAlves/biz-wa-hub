-- Super Admin Manage n8n Integrations
-- Migration: 20260815135000_super_admin_manage_n8n_integrations.sql

-- Allow Super Admins to manage n8n_integrations for any tenant (or global NULL)
DROP POLICY IF EXISTS "Super admins can manage all n8n integrations" ON public.n8n_integrations;
CREATE POLICY "Super admins can manage all n8n integrations" 
ON public.n8n_integrations
FOR ALL
TO authenticated
USING (public.has_role('super_admin'::public.app_role))
WITH CHECK (public.has_role('super_admin'::public.app_role));

-- Ensure grants are correct
GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_integrations TO authenticated;
GRANT ALL ON public.n8n_integrations TO service_role;
