
-- 1. Generalize whatsapp_connections
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS provider_type TEXT DEFAULT 'n8n', -- 'n8n', 'meta', 'evolution'
ADD COLUMN IF NOT EXISTS provider_token TEXT,
ADD COLUMN IF NOT EXISTS instance_key TEXT,
ADD COLUMN IF NOT EXISTS phone_number_id TEXT, -- For Meta API
ADD COLUMN IF NOT EXISTS waba_id TEXT;         -- For Meta API

-- 2. Migrate existing ZAPI data to general columns
UPDATE public.whatsapp_connections 
SET 
  provider_token = zapi_token,
  instance_key = zapi_instance_id
WHERE zapi_token IS NOT NULL OR zapi_instance_id IS NOT NULL;

-- 3. Grants for Meta API Integration
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;

-- 4. Create Audit Logs table for SaaS monitoring (Audit part of Fase 1/2)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit logs isolamento por tenant" ON public.audit_logs
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id());
