
-- Trigger: auto-create tenant + profile link + tenant_admin role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  -- Create a new tenant for the user
  INSERT INTO public.tenants (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Team',
    lower(replace(split_part(NEW.email, '@', 1), '.', '-')) || '-' || substr(gen_random_uuid()::text, 1, 8)
  )
  RETURNING id INTO new_tenant_id;

  -- Update the profile with the tenant_id
  UPDATE public.profiles SET tenant_id = new_tenant_id WHERE user_id = NEW.id;

  -- Assign tenant_admin role
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  -- Create default business hours
  INSERT INTO public.business_hours (tenant_id) VALUES (new_tenant_id);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();
