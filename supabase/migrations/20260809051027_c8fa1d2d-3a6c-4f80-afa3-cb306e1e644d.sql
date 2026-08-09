-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.get_whatsapp_connections_safe();

-- 1. Adjust n8n_integrations for global use
ALTER TABLE public.n8n_integrations ALTER COLUMN tenant_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_n8n_integrations_global_active;
CREATE UNIQUE INDEX idx_n8n_integrations_global_active ON public.n8n_integrations (status) WHERE (tenant_id IS NULL AND status = 'active');

-- 2. Update RLS for n8n_integrations
DROP POLICY IF EXISTS "Tenant admin manages n8n integration" ON public.n8n_integrations;
DROP POLICY IF EXISTS "Super admin full access n8n_integrations" ON public.n8n_integrations;
DROP POLICY IF EXISTS "Users can read n8n status" ON public.n8n_integrations;

CREATE POLICY "Super admin full access n8n_integrations" 
ON public.n8n_integrations 
FOR ALL 
TO authenticated 
USING (public.has_role('super_admin'));

CREATE POLICY "Users can read n8n status" 
ON public.n8n_integrations 
FOR SELECT 
TO authenticated 
USING (status = 'active');

-- 3. Refine whatsapp_connections for the new flow
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS qr_status text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS connection_error text;

-- 4. Update conversation unread logic
CREATE OR REPLACE FUNCTION public.handle_message_unread()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'incoming' AND NEW.role = 'contact' THEN
    UPDATE public.conversations
    SET unread_count = COALESCE(unread_count, 0) + 1,
        last_message_at = NEW.created_at,
        last_message_direction = 'incoming',
        awaiting_reply = true,
        last_customer_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  ELSIF NEW.direction = 'outgoing' THEN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_direction = 'outgoing',
        awaiting_reply = false,
        last_agent_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC to clear unread count
CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.conversations
  SET unread_count = 0
  WHERE id = conv_id 
    AND (tenant_id = public.get_user_tenant_id() OR public.has_role('super_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Recreate safe connection list
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe()
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone_number TEXT,
    provider_type TEXT,
    status TEXT,
    qr_status TEXT,
    qr_code TEXT,
    qr_expires_at TIMESTAMPTZ,
    webhook_status TEXT,
    has_credentials BOOLEAN,
    last_connected_at TIMESTAMPTZ,
    last_disconnected_at TIMESTAMPTZ,
    last_health_check_at TIMESTAMPTZ,
    connection_error TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wc.id,
        wc.name,
        wc.phone_number,
        wc.provider_type,
        wc.status,
        wc.qr_status,
        wc.metadata->>'qr_code' as qr_code,
        (wc.metadata->>'qr_expires_at')::TIMESTAMPTZ as qr_expires_at,
        wc.webhook_status,
        (wc.provider_session_id IS NOT NULL) as has_credentials,
        wc.last_connected_at,
        wc.last_disconnected_at,
        wc.last_health_check_at,
        wc.connection_error,
        wc.created_at
    FROM public.whatsapp_connections wc
    WHERE wc.tenant_id = public.get_user_tenant_id()
       OR public.has_role('super_admin')
    ORDER BY wc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connections_safe() TO authenticated;
