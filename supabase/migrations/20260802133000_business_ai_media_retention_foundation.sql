-- Business-only onboarding, tenant AI routing, Meta provider metadata and
-- 90-day conversation archive queue. API tokens remain in server-side secrets.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_entity_type text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS tax_id_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_retention_days integer NOT NULL DEFAULT 90;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_legal_entity_type_check,
  ADD CONSTRAINT tenants_legal_entity_type_check
    CHECK (legal_entity_type IS NULL OR legal_entity_type IN ('cnpj', 'mei')),
  DROP CONSTRAINT IF EXISTS tenants_tax_id_format_check,
  ADD CONSTRAINT tenants_tax_id_format_check CHECK (
    tax_id IS NULL OR
    (legal_entity_type = 'cnpj' AND tax_id ~ '^[0-9]{14}$') OR
    (legal_entity_type = 'mei' AND tax_id ~ '^[0-9]{11}$')
  ),
  DROP CONSTRAINT IF EXISTS tenants_message_retention_days_check,
  ADD CONSTRAINT tenants_message_retention_days_check
    CHECK (message_retention_days BETWEEN 30 AND 365);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tax_id_unique_idx
  ON public.tenants (tax_id) WHERE tax_id IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_document_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_document_type_check
  CHECK (document_type IS NULL OR document_type IN ('cnpj', 'mei'));

CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  entity_type text := NEW.raw_user_meta_data->>'document_type';
  entity_tax_id text := regexp_replace(coalesce(NEW.raw_user_meta_data->>'document_number', ''), '\\D', '', 'g');
BEGIN
  IF entity_type NOT IN ('cnpj', 'mei') THEN
    RAISE EXCEPTION 'Cadastro permitido apenas para empresa com CNPJ ou MEI com CPF do titular';
  END IF;
  IF (entity_type = 'cnpj' AND length(entity_tax_id) <> 14)
     OR (entity_type = 'mei' AND length(entity_tax_id) <> 11) THEN
    RAISE EXCEPTION 'Documento empresarial invÃ¡lido';
  END IF;

  INSERT INTO public.tenants (
    name, slug, legal_entity_type, tax_id, owner_user_id
  ) VALUES (
    coalesce(nullif(NEW.raw_user_meta_data->>'company_name', ''), NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8),
    entity_type, entity_tax_id, NEW.id
  ) RETURNING id INTO new_tenant_id;

  UPDATE public.profiles SET tenant_id = new_tenant_id WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, new_tenant_id, 'tenant_admin');
  INSERT INTO public.business_hours (tenant_id) VALUES (new_tenant_id);
  INSERT INTO public.ai_provider_settings (tenant_id) VALUES (new_tenant_id);
  RETURN NEW;
END;
$$;

ALTER TABLE public.agents_config
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ollama',
  ADD COLUMN IF NOT EXISTS fallback_provider text,
  ADD COLUMN IF NOT EXISTS fallback_model text,
  ADD COLUMN IF NOT EXISTS classifier_model text NOT NULL DEFAULT 'qwen3:8b',
  ADD COLUMN IF NOT EXISTS memory_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS auto_reply_when_offline boolean NOT NULL DEFAULT false;

ALTER TABLE public.agents_config
  DROP CONSTRAINT IF EXISTS agents_config_provider_check,
  ADD CONSTRAINT agents_config_provider_check
    CHECK (provider IN ('ollama', 'openai', 'gemini')),
  DROP CONSTRAINT IF EXISTS agents_config_fallback_provider_check,
  ADD CONSTRAINT agents_config_fallback_provider_check
    CHECK (fallback_provider IS NULL OR fallback_provider IN ('ollama', 'openai', 'gemini')),
  DROP CONSTRAINT IF EXISTS agents_config_memory_days_check,
  ADD CONSTRAINT agents_config_memory_days_check CHECK (memory_days BETWEEN 1 AND 90);

CREATE TABLE IF NOT EXISTS public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  ollama_enabled boolean NOT NULL DEFAULT true,
  openai_enabled boolean NOT NULL DEFAULT false,
  gemini_enabled boolean NOT NULL DEFAULT false,
  openai_secret_name text,
  gemini_secret_name text,
  classifier_provider text NOT NULL DEFAULT 'ollama',
  classifier_model text NOT NULL DEFAULT 'qwen3:8b',
  memory_days integer NOT NULL DEFAULT 90 CHECK (memory_days BETWEEN 1 AND 90),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.ai_provider_settings.openai_secret_name IS
  'Reference to a server-side secret; never store the API key in this table.';
COMMENT ON COLUMN public.ai_provider_settings.gemini_secret_name IS
  'Reference to a server-side secret; never store the API key in this table.';

CREATE TABLE IF NOT EXISTS public.meta_whatsapp_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  business_account_id text,
  phone_number_id text,
  app_id text,
  access_token_secret_name text,
  verify_token_secret_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validating', 'active', 'error')),
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connection_id)
);

COMMENT ON COLUMN public.meta_whatsapp_configs.access_token_secret_name IS
  'Reference only. The Meta access token must be stored in server-side secrets.';
COMMENT ON COLUMN public.meta_whatsapp_configs.verify_token_secret_name IS
  'Reference only. The webhook verify token must be stored in server-side secrets.';

CREATE TABLE IF NOT EXISTS public.conversation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  cutoff_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  summary text,
  pdf_storage_path text,
  message_count integer NOT NULL DEFAULT 0,
  content_hash text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (conversation_id, cutoff_at)
);

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins manage AI providers" ON public.ai_provider_settings;
CREATE POLICY "Tenant admins manage AI providers" ON public.ai_provider_settings
  FOR ALL TO authenticated
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'))
  WITH CHECK (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

DROP POLICY IF EXISTS "Tenant admins manage Meta WhatsApp" ON public.meta_whatsapp_configs;
CREATE POLICY "Tenant admins manage Meta WhatsApp" ON public.meta_whatsapp_configs
  FOR ALL TO authenticated
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'))
  WITH CHECK (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

DROP POLICY IF EXISTS "Tenant members view conversation archives" ON public.conversation_archives;
CREATE POLICY "Tenant members view conversation archives" ON public.conversation_archives
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.queue_due_conversation_archives()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queued integer;
BEGIN
  INSERT INTO public.conversation_archives (tenant_id, conversation_id, cutoff_at, message_count)
  SELECT
    conversation.tenant_id,
    conversation.id,
    date_trunc('day', now() - make_interval(days => tenant.message_retention_days)),
    count(message.id)::integer
  FROM public.conversations AS conversation
  JOIN public.tenants AS tenant ON tenant.id = conversation.tenant_id
  JOIN public.messages AS message ON message.conversation_id = conversation.id
  WHERE message.created_at < now() - make_interval(days => tenant.message_retention_days)
  GROUP BY conversation.tenant_id, conversation.id, tenant.message_retention_days
  ON CONFLICT (conversation_id, cutoff_at) DO NOTHING;

  GET DIAGNOSTICS queued = ROW_COUNT;
  RETURN queued;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_due_conversation_archives() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_due_conversation_archives() TO service_role;

-- Raw messages are intentionally not deleted here. A worker must generate the
-- PDF, upload it to private storage, verify its hash and only then purge data
-- under an explicit tenant retention policy.

