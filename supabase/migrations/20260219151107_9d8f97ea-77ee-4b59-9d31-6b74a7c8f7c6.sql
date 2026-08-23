
-- ============================================================
-- 1. RECRIAR TRIGGERS EM auth.users
-- ============================================================

-- Trigger para criar o profile na tabela profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para criar o tenant e associar ao profile
DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();

-- ============================================================
-- 2. BACKFILL: usuário jefson.ti@gmail.com
-- ============================================================
DO $$
DECLARE
  v_user_id uuid := '888b8e33-7a27-4d5f-8ba9-6725c15f247f';
  v_tenant_id uuid;
  v_profile_exists boolean;
  v_tenant_exists boolean;
BEGIN
  -- Projetos novos não possuem o UUID histórico do projeto original.
  -- O trigger acima criará profile/tenant normalmente quando o usuário se cadastrar.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE NOTICE 'Usuário histórico não existe neste projeto; backfill ignorado.';
    RETURN;
  END IF;

  -- Verificar se profile já existe
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = v_user_id) INTO v_profile_exists;

  -- Verificar se tenant já existe via profile
  SELECT tenant_id IS NOT NULL INTO v_tenant_exists
  FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

  -- Se não tem profile, criar
  IF NOT v_profile_exists THEN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (v_user_id, 'jefson.ti@gmail.com', 'Jefson de Souza Alves')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Se profile existe mas sem tenant_id, criar tenant e associar
  IF NOT v_tenant_exists THEN
    -- Criar o tenant
    INSERT INTO public.tenants (name, slug, status, plan)
    VALUES (
      'Workspace de Jefson de Souza Alves',
      'jefson-' || substr(gen_random_uuid()::text, 1, 8),
      'active',
      'trial'
    )
    RETURNING id INTO v_tenant_id;

    -- Atualizar o profile com o tenant_id
    UPDATE public.profiles
    SET tenant_id = v_tenant_id
    WHERE user_id = v_user_id;

    -- Criar role tenant_admin
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_user_id, v_tenant_id, 'tenant_admin')
    ON CONFLICT DO NOTHING;

    -- Criar business_hours padrão
    INSERT INTO public.business_hours (tenant_id)
    VALUES (v_tenant_id)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Backfill concluído: tenant_id = %', v_tenant_id;
  ELSE
    -- Profile já tem tenant_id, garantir que tem o role
    SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE user_id = v_user_id LIMIT 1;
    
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_user_id, v_tenant_id, 'tenant_admin')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Profile já tinha tenant_id = %, apenas garantindo o role', v_tenant_id;
  END IF;
END $$;
