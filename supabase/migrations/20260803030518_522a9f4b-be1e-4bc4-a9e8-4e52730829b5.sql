-- Server-side document validation (never trust the browser)
CREATE OR REPLACE FUNCTION public.is_valid_cpf(_digits text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text; s int; r int; i int;
BEGIN
  d := regexp_replace(coalesce(_digits,''), '\D', '', 'g');
  IF length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..9 LOOP s := s + (substr(d,i,1))::int * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> (substr(d,10,1))::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + (substr(d,i,1))::int * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = (substr(d,11,1))::int;
END; $$;

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(_digits text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text; w int[]; s int; r int; i int;
BEGIN
  d := regexp_replace(coalesce(_digits,''), '\D', '', 'g');
  IF length(d) <> 14 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  w := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0;
  FOR i IN 1..12 LOOP s := s + (substr(d,i,1))::int * w[i]; END LOOP;
  r := s % 11; IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
  IF r <> (substr(d,13,1))::int THEN RETURN false; END IF;
  w := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0;
  FOR i IN 1..13 LOOP s := s + (substr(d,i,1))::int * w[i]; END LOOP;
  r := s % 11; IF r < 2 THEN r := 0; ELSE r := 11 - r; END IF;
  RETURN r = (substr(d,14,1))::int;
END; $$;

REVOKE ALL ON FUNCTION public.is_valid_cpf(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_cnpj(text) FROM PUBLIC;

-- Business-only signup: creates the tenant with verified-format business data
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id uuid;
  doc_type text;
  doc_digits text;
  company_name text;
  owner_full_name text;
BEGIN
  doc_type := lower(coalesce(NEW.raw_user_meta_data->>'document_type', ''));
  doc_digits := regexp_replace(coalesce(NEW.raw_user_meta_data->>'document_number',''), '\D', '', 'g');
  company_name := nullif(trim(coalesce(NEW.raw_user_meta_data->>'company_name', '')), '');
  owner_full_name := nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), '');

  IF doc_type NOT IN ('cnpj','mei') THEN
    RAISE EXCEPTION 'Cadastro permitido somente para empresa (CNPJ) ou MEI';
  END IF;
  IF company_name IS NULL THEN
    RAISE EXCEPTION 'Nome empresarial obrigatório';
  END IF;
  IF owner_full_name IS NULL THEN
    RAISE EXCEPTION 'Nome do proprietário obrigatório';
  END IF;
  IF doc_type = 'cnpj' AND NOT public.is_valid_cnpj(doc_digits) THEN
    RAISE EXCEPTION 'CNPJ inválido';
  END IF;
  IF doc_type = 'mei' AND NOT public.is_valid_cpf(doc_digits) THEN
    RAISE EXCEPTION 'CPF do titular MEI inválido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE document_number = doc_digits) THEN
    RAISE EXCEPTION 'Documento empresarial já cadastrado';
  END IF;

  INSERT INTO public.tenants (
    name, slug, document_type, document_number, legal_name, owner_name, owner_user_id, tax_id_verified_at
  ) VALUES (
    company_name,
    lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8),
    doc_type::public.business_doc_type,
    doc_digits,
    company_name,
    owner_full_name,
    NEW.id,
    NULL -- format is valid, but the document was NOT verified against any registry
  )
  RETURNING id INTO new_tenant_id;

  UPDATE public.profiles SET tenant_id = new_tenant_id WHERE user_id = NEW.id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  INSERT INTO public.business_hours (tenant_id) VALUES (new_tenant_id);

  INSERT INTO public.ai_attendance_settings (tenant_id, mode)
  VALUES (new_tenant_id, 'off')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.handle_new_user_tenant() FROM PUBLIC;