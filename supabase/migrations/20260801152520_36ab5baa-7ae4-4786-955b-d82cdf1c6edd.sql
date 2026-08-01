-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.provider_type AS ENUM ('n8n_unofficial','whatsapp_cloud_api','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outbox_status AS ENUM ('pending','processing','sent','failed','dead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inbound_status AS ENUM ('received','processing','processed','failed','duplicate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ WHATSAPP_CONNECTIONS EVOLUTION ============
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS provider_type public.provider_type NOT NULL DEFAULT 'n8n_unofficial',
  ADD COLUMN IF NOT EXISTS provider_instance_id text,
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS credential_reference text,
  ADD COLUMN IF NOT EXISTS qr_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS webhook_status text NOT NULL DEFAULT 'unset',
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS connection_error text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- preserve legacy data
UPDATE public.whatsapp_connections
SET provider_instance_id = COALESCE(provider_instance_id, zapi_instance_id),
    provider_session_id = COALESCE(provider_session_id, zapi_instance_id)
WHERE zapi_instance_id IS NOT NULL;

ALTER TABLE public.whatsapp_connections ALTER COLUMN zapi_instance_id DROP NOT NULL;
ALTER TABLE public.whatsapp_connections ALTER COLUMN zapi_token DROP NOT NULL;

COMMENT ON COLUMN public.whatsapp_connections.zapi_instance_id IS 'DEPRECATED (GREEN-API): use provider_instance_id';
COMMENT ON COLUMN public.whatsapp_connections.zapi_token IS 'DEPRECATED (GREEN-API): credentials live in secrets, referenced by credential_reference';
COMMENT ON COLUMN public.whatsapp_connections.zapi_client_token IS 'DEPRECATED (GREEN-API)';
COMMENT ON COLUMN public.whatsapp_connections.api_url IS 'DEPRECATED (GREEN-API)';

-- column-level privileges: frontend must never read credentials
REVOKE SELECT, INSERT, UPDATE ON public.whatsapp_connections FROM authenticated;
GRANT SELECT (id, tenant_id, name, phone_number, provider_type, provider_instance_id,
  provider_session_id, status, qr_status, webhook_status, webhook_url, last_connected_at,
  last_disconnected_at, last_health_check_at, connection_error, metadata, sync_status,
  created_at, updated_at) ON public.whatsapp_connections TO authenticated;
GRANT INSERT (tenant_id, name, phone_number, provider_type, provider_instance_id, webhook_url, metadata),
      UPDATE (name, phone_number, provider_type, provider_instance_id, webhook_url, metadata)
  ON public.whatsapp_connections TO authenticated;
GRANT DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;

-- safe read function (masked)
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe()
RETURNS TABLE (
  id uuid, name text, phone_number text, provider_type public.provider_type,
  status text, qr_status text, webhook_status text, has_credentials boolean,
  last_connected_at timestamptz, last_disconnected_at timestamptz,
  last_health_check_at timestamptz, connection_error text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone_number, c.provider_type, c.status, c.qr_status,
         c.webhook_status,
         (c.credential_reference IS NOT NULL OR c.zapi_token IS NOT NULL) AS has_credentials,
         c.last_connected_at, c.last_disconnected_at, c.last_health_check_at,
         left(coalesce(c.connection_error,''), 160) NULLIF_EMPTY_PLACEHOLDER,
         c.created_at
  FROM public.whatsapp_connections c
  WHERE c.tenant_id = public.get_user_tenant_id();
$$;

-- ============ N8N INTEGRATIONS ============
CREATE TABLE IF NOT EXISTS public.n8n_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'n8n',
  environment text NOT NULL DEFAULT 'production',
  base_url text,
  webhook_path text NOT NULL DEFAULT '/webhook/platform',
  credential_reference text,
  webhook_secret_reference text,
  status text NOT NULL DEFAULT 'inactive',
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, tenant_id, name, environment, base_url, webhook_path, status,
  last_tested_at, last_success_at, last_error_at, last_error_message, created_at, updated_at)
  ON public.n8n_integrations TO authenticated;
GRANT INSERT (tenant_id, name, environment, base_url, webhook_path, status),
      UPDATE (name, environment, base_url, webhook_path, status)
  ON public.n8n_integrations TO authenticated;
GRANT DELETE ON public.n8n_integrations TO authenticated;
GRANT ALL ON public.n8n_integrations TO service_role;
ALTER TABLE public.n8n_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "n8n select by tenant" ON public.n8n_integrations FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "n8n manage by admin" ON public.n8n_integrations FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));
CREATE TRIGGER n8n_integrations_updated_at BEFORE UPDATE ON public.n8n_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ EVENT OUTBOX ============
CREATE TABLE IF NOT EXISTS public.event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_outbox_pending_idx ON public.event_outbox (status, next_retry_at);
GRANT SELECT ON public.event_outbox TO authenticated;
GRANT ALL ON public.event_outbox TO service_role;
ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox select by tenant admin" ON public.event_outbox FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));

-- ============ INBOUND EVENTS ============
CREATE TABLE IF NOT EXISTS public.inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text,
  processing_status public.inbound_status NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text,
  CONSTRAINT inbound_events_source_external_unique UNIQUE (source, external_event_id)
);
GRANT SELECT ON public.inbound_events TO authenticated;
GRANT ALL ON public.inbound_events TO service_role;
ALTER TABLE public.inbound_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound select by tenant admin" ON public.inbound_events FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));

-- ============ WEBHOOK DELIVERY ATTEMPTS ============
CREATE TABLE IF NOT EXISTS public.webhook_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  target text NOT NULL,
  http_status integer,
  response_excerpt text,
  duration_ms integer,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wda_event_idx ON public.webhook_delivery_attempts (event_id);
GRANT SELECT ON public.webhook_delivery_attempts TO authenticated;
GRANT ALL ON public.webhook_delivery_attempts TO service_role;
ALTER TABLE public.webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wda select by tenant admin" ON public.webhook_delivery_attempts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));

-- ============ CONNECTION <-> DEPARTMENTS ============
CREATE TABLE IF NOT EXISTS public.connection_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_departments_unique UNIQUE (connection_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_departments TO authenticated;
GRANT ALL ON public.connection_departments TO service_role;
ALTER TABLE public.connection_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cd select by tenant" ON public.connection_departments FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "cd manage by admin" ON public.connection_departments FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));

-- ============ USER <-> CONNECTION ACCESS ============
CREATE TABLE IF NOT EXISTS public.user_connection_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_reply boolean NOT NULL DEFAULT true,
  can_manage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_connection_access_unique UNIQUE (user_id, connection_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_connection_access TO authenticated;
GRANT ALL ON public.user_connection_access TO service_role;
ALTER TABLE public.user_connection_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uca select own or admin" ON public.user_connection_access FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (user_id = auth.uid() OR public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));
CREATE POLICY "uca manage by admin" ON public.user_connection_access FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role_in_tenant(tenant_id,'tenant_admin') OR public.has_role('super_admin')));

-- helper: can current user access a connection
CREATE OR REPLACE FUNCTION public.can_access_connection(_connection_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_connections c
    WHERE c.id = _connection_id
      AND c.tenant_id = public.get_user_tenant_id()
      AND (
        public.has_role_in_tenant(c.tenant_id,'tenant_admin')
        OR public.has_role('super_admin')
        OR NOT EXISTS (SELECT 1 FROM public.user_connection_access a WHERE a.connection_id = c.id)
        OR EXISTS (SELECT 1 FROM public.user_connection_access a
                   WHERE a.connection_id = c.id AND a.user_id = auth.uid() AND a.can_view)
      )
  );
$$;