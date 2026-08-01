
-- FASE 1: Novas tabelas e colunas para AgentFlow refactoring

-- 1. Tabela schedules (agendamento de mensagens)
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  to_chat_id text NOT NULL,
  message_body text,
  media jsonb,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  fail_reason text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access schedules" ON public.schedules
  FOR ALL USING (has_role('super_admin'::app_role));

CREATE POLICY "Tenant admin manages schedules" ON public.schedules
  FOR ALL USING (has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));

CREATE POLICY "Agent manages own schedules" ON public.schedules
  FOR ALL USING (has_role_in_tenant(tenant_id, 'agent'::app_role));

CREATE POLICY "Tenant members view schedules" ON public.schedules
  FOR SELECT USING (is_tenant_member(tenant_id));

-- 2. Tabela internal_notes (notas internas da equipe)
CREATE TABLE IF NOT EXISTS public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access notes" ON public.internal_notes
  FOR ALL USING (has_role('super_admin'::app_role));

CREATE POLICY "Tenant admin manages notes" ON public.internal_notes
  FOR ALL USING (has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));

CREATE POLICY "Agents manage notes" ON public.internal_notes
  FOR ALL USING (has_role_in_tenant(tenant_id, 'agent'::app_role));

CREATE POLICY "Tenant members view notes" ON public.internal_notes
  FOR SELECT USING (is_tenant_member(tenant_id));

-- 3. Tabela ai_providers (provedor de IA global ou por tenant)
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'tenant',
  provider text NOT NULL DEFAULT 'lovable',
  api_key_encrypted text,
  model text DEFAULT 'google/gemini-3-flash-preview',
  config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access ai_providers" ON public.ai_providers
  FOR ALL USING (has_role('super_admin'::app_role));

CREATE POLICY "Tenant admin manages own ai_providers" ON public.ai_providers
  FOR ALL USING (has_role_in_tenant(tenant_id, 'tenant_admin'::app_role));

CREATE POLICY "Tenant members view ai_providers" ON public.ai_providers
  FOR SELECT USING (is_tenant_member(tenant_id));

-- 4. Adicionar colunas em conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS wa_chat_id text,
  ADD COLUMN IF NOT EXISTS ai_mode text DEFAULT 'auto';

-- 5. Adicionar colunas em contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_chat_id text,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- 6. Adicionar colunas em whatsapp_connections
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS api_url text DEFAULT 'https://api.green-api.com',
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle';

-- 7. Adicionar colunas em messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'incoming',
  ADD COLUMN IF NOT EXISTS wa_message_id text;

-- 8. Índices de performance
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON public.conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_wa_chat ON public.contacts(tenant_id, wa_chat_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON public.contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_schedules_run_at_status ON public.schedules(run_at, status);
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON public.messages(wa_message_id);

-- 9. Realtime para tabelas críticas
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
