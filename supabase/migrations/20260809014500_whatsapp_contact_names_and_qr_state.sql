-- Ensure contacts table and whatsapp_connections have the latest state fields.

ALTER TABLE public.whatsapp_connections 
  ADD COLUMN IF NOT EXISTS qr_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS connection_error text;

-- Update RLS for safe connection view if not already matching the upstream requirement
CREATE OR REPLACE FUNCTION public.can_access_connection(_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.whatsapp_connections
    WHERE id = _connection_id
      AND (tenant_id = public.get_user_tenant_id() OR public.has_role('super_admin'))
  );
END;
$$;

-- Finalize contact naming logic in sync batches
CREATE INDEX IF NOT EXISTS contacts_phone_tenant_idx ON public.contacts (phone, tenant_id);
