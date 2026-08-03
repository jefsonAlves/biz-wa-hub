-- =========================================================
-- Business / AI / Media / Retention foundation
-- =========================================================

-- ---------- tenants: business registration ----------
DO $$ BEGIN
  CREATE TYPE public.business_doc_type AS ENUM ('cnpj','mei');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.retention_policy AS ENUM ('keep_messages','delete_after_pdf','summary_and_pdf_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS document_type public.business_doc_type,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS tax_id_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_policy public.retention_policy NOT NULL DEFAULT 'keep_messages',
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 90;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_document_number_key
  ON public.tenants (document_number) WHERE document_number IS NOT NULL;

-- ---------- ai_provider_settings ----------
DO $$ BEGIN
  CREATE TYPE public.ai_provider AS ENUM ('ollama','openai','gemini');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_status AS ENUM ('not_configured','validating','active','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider public.ai_provider NOT NULL,
  model text,
  base_url text,
  api_key_secret_name text,
  status public.provider_status NOT NULL DEFAULT 'not_configured',
  is_active boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_settings TO authenticated;
GRANT ALL ON public.ai_provider_settings TO service_role;
ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_provider_settings_select" ON public.ai_provider_settings
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "ai_provider_settings_write" ON public.ai_provider_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role_in_tenant(tenant_id,'tenant_admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role_in_tenant(tenant_id,'tenant_admin'));

CREATE TRIGGER ai_provider_settings_updated_at BEFORE UPDATE ON public.ai_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- meta_whatsapp_configs ----------
CREATE TABLE IF NOT EXISTS public.meta_whatsapp_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  business_account_id text,
  phone_number_id text,
  app_id text,
  access_token_secret_name text,
  verify_token_secret_name text,
  graph_api_version text NOT NULL DEFAULT 'v21.0',
  status public.provider_status NOT NULL DEFAULT 'not_configured',
  last_validated_at timestamptz,
  validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_whatsapp_configs TO authenticated;
GRANT ALL ON public.meta_whatsapp_configs TO service_role;
ALTER TABLE public.meta_whatsapp_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_configs_select" ON public.meta_whatsapp_configs
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "meta_configs_write" ON public.meta_whatsapp_configs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role_in_tenant(tenant_id,'tenant_admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role_in_tenant(tenant_id,'tenant_admin'));

CREATE TRIGGER meta_whatsapp_configs_updated_at BEFORE UPDATE ON public.meta_whatsapp_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- conversation_archives ----------
DO $$ BEGIN
  CREATE TYPE public.archive_status AS ENUM ('pending','processing','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.conversation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status public.archive_status NOT NULL DEFAULT 'pending',
  pdf_storage_path text,
  content_hash text,
  summary text,
  message_count integer NOT NULL DEFAULT 0,
  messages_deleted_at timestamptz,
  last_accessed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, period_start, period_end)
);

GRANT SELECT ON public.conversation_archives TO authenticated;
GRANT ALL ON public.conversation_archives TO service_role;
ALTER TABLE public.conversation_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_archives_select" ON public.conversation_archives
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER conversation_archives_updated_at BEFORE UPDATE ON public.conversation_archives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS conversation_archives_tenant_status_idx
  ON public.conversation_archives (tenant_id, status);

-- ---------- messages: media metadata ----------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS media_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS media_hash text,
  ADD COLUMN IF NOT EXISTS media_status text NOT NULL DEFAULT 'none';

-- ---------- departments: routing config ----------
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_message text,
  ADD COLUMN IF NOT EXISTS sla_minutes integer,
  ADD COLUMN IF NOT EXISTS business_hours jsonb,
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid REFERENCES public.agents_config(id) ON DELETE SET NULL;

-- ---------- conversations: classification + memory ----------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_urgency text,
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_requires_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS memory_window_start timestamptz;

-- ---------- ai_attendance_settings: memory + handoff ----------
ALTER TABLE public.ai_attendance_settings
  ADD COLUMN IF NOT EXISTS memory_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_confidence numeric NOT NULL DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS handoff_message text,
  ADD COLUMN IF NOT EXISTS fallback_provider public.ai_provider,
  ADD COLUMN IF NOT EXISTS primary_provider public.ai_provider;

CREATE OR REPLACE FUNCTION public.validate_memory_days()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.memory_days IS NULL OR NEW.memory_days < 1 OR NEW.memory_days > 90 THEN
    RAISE EXCEPTION 'memory_days must be between 1 and 90';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.validate_memory_days() FROM PUBLIC;

DROP TRIGGER IF EXISTS ai_attendance_settings_memory_days ON public.ai_attendance_settings;
CREATE TRIGGER ai_attendance_settings_memory_days
  BEFORE INSERT OR UPDATE ON public.ai_attendance_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_memory_days();