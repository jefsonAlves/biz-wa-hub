
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  external_id TEXT,
  max_connections INT DEFAULT 1,
  max_agents INT DEFAULT 2,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  external_id TEXT,
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.plans TO service_role;
GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT ON public.plans TO anon;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Members can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()));

INSERT INTO public.plans (name, description, price, max_connections, max_agents) VALUES
  ('Starter', 'Ideal para pequenos negócios', 250.00, 1, 2),
  ('Profissional', 'Para empresas em crescimento', 397.00, 3, 10),
  ('Enterprise', 'Solução completa para grandes volumes', 597.00, 10, 50);
