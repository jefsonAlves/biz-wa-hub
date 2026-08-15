-- Super Admin Manage WhatsApp Connections by Tenant
-- Migration: 20260815133000_super_admin_whatsapp_connections_by_tenant.sql

-- Adjust RLS for whatsapp_connections to allow Super Admins to select all
DROP POLICY IF EXISTS "Super admins can select all connections" ON public.whatsapp_connections;
CREATE POLICY "Super admins can select all connections" 
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (public.has_role('super_admin'::public.app_role));

-- Ensure grants are correct
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;
