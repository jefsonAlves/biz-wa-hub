
-- =============================================
-- AgentFlow SaaS Multi-Tenant Schema
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin', 'tenant_admin', 'agent', 'viewer');
CREATE TYPE public.conversation_status AS ENUM ('open', 'waiting', 'closed', 'archived');
CREATE TYPE public.sales_status AS ENUM ('none', 'lead', 'negotiation', 'won', 'lost');
CREATE TYPE public.message_type AS ENUM ('text', 'audio', 'image', 'document', 'video', 'sticker', 'location');
CREATE TYPE public.message_role AS ENUM ('contact', 'agent', 'ai', 'system');
CREATE TYPE public.knowledge_type AS ENUM ('text', 'pdf', 'url');
CREATE TYPE public.knowledge_status AS ENUM ('processing', 'indexed', 'error');
CREATE TYPE public.log_level AS ENUM ('info', 'warn', 'error', 'critical');
CREATE TYPE public.plan_tier AS ENUM ('trial', 'free', 'pro', 'enterprise');

-- 2. PLAN CONFIGS
CREATE TABLE public.plan_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier public.plan_tier NOT NULL UNIQUE,
  name TEXT NOT NULL,
  max_messages_per_month INT NOT NULL DEFAULT 1000,
  max_agents INT NOT NULL DEFAULT 2,
  max_departments INT NOT NULL DEFAULT 2,
  max_knowledge_items INT NOT NULL DEFAULT 10,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans
INSERT INTO public.plan_configs (tier, name, max_messages_per_month, max_agents, max_departments, max_knowledge_items) VALUES
  ('trial', 'Trial', 100, 1, 1, 5),
  ('free', 'Free', 500, 2, 2, 10),
  ('pro', 'Pro', 10000, 10, 10, 100),
  ('enterprise', 'Enterprise', 999999, 999, 999, 9999);

-- 3. TENANTS
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan public.plan_tier NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'active',
  messages_this_month INT NOT NULL DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ DEFAULT now(),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. USER ROLES (separate table as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, tenant_id)
);

-- 6. DEPARTMENTS
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AGENTS CONFIG (AI personas)
CREATE TABLE public.agents_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  persona TEXT,
  system_prompt TEXT,
  model TEXT DEFAULT 'google/gemini-3-flash-preview',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  few_shot_examples JSONB DEFAULT '[]',
  blocked_keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. WHATSAPP CONNECTIONS
CREATE TABLE public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Principal',
  phone_number TEXT,
  zapi_instance_id TEXT NOT NULL,
  zapi_token TEXT NOT NULL,
  zapi_client_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  webhook_url TEXT,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. CONTACTS
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- 10. CONVERSATIONS
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.conversation_status NOT NULL DEFAULT 'open',
  sales_status public.sales_status NOT NULL DEFAULT 'none',
  deal_value NUMERIC(12,2),
  unread_count INT NOT NULL DEFAULT 0,
  ai_paused BOOLEAN NOT NULL DEFAULT false,
  next_meeting TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role public.message_role NOT NULL DEFAULT 'contact',
  content TEXT,
  message_type public.message_type NOT NULL DEFAULT 'text',
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  media_url TEXT,
  media_mime_type TEXT,
  zapi_message_id TEXT,
  delivery_status TEXT DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. KNOWLEDGE ITEMS
CREATE TABLE public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type public.knowledge_type NOT NULL DEFAULT 'text',
  content TEXT,
  source_url TEXT,
  file_url TEXT,
  status public.knowledge_status NOT NULL DEFAULT 'processing',
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. BUSINESS HOURS
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  config JSONB NOT NULL DEFAULT '{
    "timezone": "America/Sao_Paulo",
    "days": {
      "monday": {"enabled": true, "start": "08:00", "end": "18:00"},
      "tuesday": {"enabled": true, "start": "08:00", "end": "18:00"},
      "wednesday": {"enabled": true, "start": "08:00", "end": "18:00"},
      "thursday": {"enabled": true, "start": "08:00", "end": "18:00"},
      "friday": {"enabled": true, "start": "08:00", "end": "18:00"},
      "saturday": {"enabled": false, "start": "08:00", "end": "12:00"},
      "sunday": {"enabled": false, "start": "08:00", "end": "12:00"}
    },
    "outside_message": "Estamos fora do horário de atendimento. Retornaremos em breve!"
  }',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. SYSTEM LOGS
CREATE TABLE public.system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  level public.log_level NOT NULL DEFAULT 'info',
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_tenant(_tenant_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND tenant_id = _tenant_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND tenant_id = _tenant_id
  );
$$;

-- =============================================
-- ENABLE RLS
-- =============================================

ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- PLAN_CONFIGS: super_admin reads all, anyone authenticated can read
CREATE POLICY "Anyone can read plans" ON public.plan_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manages plans" ON public.plan_configs FOR ALL TO authenticated USING (public.has_role('super_admin'));

-- TENANTS
CREATE POLICY "Super admin full access tenants" ON public.tenants FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Members can view own tenant" ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(id));
CREATE POLICY "Tenant admin can update own tenant" ON public.tenants FOR UPDATE TO authenticated USING (public.has_role_in_tenant(id, 'tenant_admin'));

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Tenant members can view tenant profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Super admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role('super_admin'));

-- USER_ROLES
CREATE POLICY "Super admin full access roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant admin manages roles" ON public.user_roles FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin') AND role != 'super_admin');
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Tenant members can view tenant roles" ON public.user_roles FOR SELECT TO authenticated 
  USING (public.is_tenant_member(tenant_id));

-- DEPARTMENTS
CREATE POLICY "Super admin full access departments" ON public.departments FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view departments" ON public.departments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages departments" ON public.departments FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

-- AGENTS_CONFIG
CREATE POLICY "Super admin full access agents" ON public.agents_config FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view agents" ON public.agents_config FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages agents" ON public.agents_config FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

-- WHATSAPP_CONNECTIONS
CREATE POLICY "Super admin full access whatsapp" ON public.whatsapp_connections FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view connections" ON public.whatsapp_connections FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages connections" ON public.whatsapp_connections FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

-- CONTACTS
CREATE POLICY "Super admin full access contacts" ON public.contacts FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view contacts" ON public.contacts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin/agent manage contacts" ON public.contacts FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role_in_tenant(tenant_id, 'agent'));

-- CONVERSATIONS
CREATE POLICY "Super admin full access conversations" ON public.conversations FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view conversations" ON public.conversations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages conversations" ON public.conversations FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));
CREATE POLICY "Agent manages assigned conversations" ON public.conversations FOR UPDATE TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'agent') AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL));
CREATE POLICY "Agent creates conversations" ON public.conversations FOR INSERT TO authenticated 
  WITH CHECK (public.has_role_in_tenant(tenant_id, 'agent'));

-- MESSAGES
CREATE POLICY "Super admin full access messages" ON public.messages FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view messages" ON public.messages FOR SELECT TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND public.is_tenant_member(c.tenant_id)
  ));
CREATE POLICY "Tenant admin/agent can insert messages" ON public.messages FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND (
      public.has_role_in_tenant(c.tenant_id, 'tenant_admin') OR 
      public.has_role_in_tenant(c.tenant_id, 'agent')
    )
  ));

-- KNOWLEDGE_ITEMS
CREATE POLICY "Super admin full access knowledge" ON public.knowledge_items FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view knowledge" ON public.knowledge_items FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages knowledge" ON public.knowledge_items FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

-- BUSINESS_HOURS
CREATE POLICY "Super admin full access hours" ON public.business_hours FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Tenant members can view hours" ON public.business_hours FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admin manages hours" ON public.business_hours FOR ALL TO authenticated 
  USING (public.has_role_in_tenant(tenant_id, 'tenant_admin'));

-- SYSTEM_LOGS
CREATE POLICY "Super admin full access logs" ON public.system_logs FOR ALL TO authenticated USING (public.has_role('super_admin'));
CREATE POLICY "Super admin insert logs" ON public.system_logs FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_agents_config_updated_at BEFORE UPDATE ON public.agents_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_whatsapp_updated_at BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_knowledge_updated_at BEFORE UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- =============================================
-- STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);

CREATE POLICY "Authenticated users can upload media" ON storage.objects 
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');

CREATE POLICY "Anyone can view media" ON storage.objects 
  FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Users can update own media" ON storage.objects 
  FOR UPDATE TO authenticated USING (bucket_id = 'media');

CREATE POLICY "Users can delete own media" ON storage.objects 
  FOR DELETE TO authenticated USING (bucket_id = 'media');

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX idx_departments_tenant_id ON public.departments(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_knowledge_items_tenant_id ON public.knowledge_items(tenant_id);
CREATE INDEX idx_system_logs_tenant_id ON public.system_logs(tenant_id);
CREATE INDEX idx_whatsapp_connections_instance ON public.whatsapp_connections(zapi_instance_id);
