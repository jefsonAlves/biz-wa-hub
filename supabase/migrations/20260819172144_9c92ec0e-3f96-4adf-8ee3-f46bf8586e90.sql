ALTER TYPE public.provider_type ADD VALUE IF NOT EXISTS 'baileys_backend';

CREATE TABLE IF NOT EXISTS public.whatsapp_backends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Backend WhatsApp',
  base_url text NOT NULL,
  api_token text,
  auth_email text,
  auth_password text,
  session_token text,
  session_token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'unknown',
  last_check_at timestamptz,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

GRANT SELECT ON public.whatsapp_backends TO authenticated;
GRANT ALL ON public.whatsapp_backends TO service_role;

ALTER TABLE public.whatsapp_backends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backends visiveis para a propria empresa" ON public.whatsapp_backends;
CREATE POLICY "Backends visiveis para a propria empresa"
ON public.whatsapp_backends
FOR SELECT
TO authenticated
USING (
  public.has_role('super_admin'::public.app_role)
  OR tenant_id = public.get_user_tenant_id()
);

CREATE OR REPLACE FUNCTION public.touch_whatsapp_backends_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_whatsapp_backends_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_whatsapp_backends_updated_at ON public.whatsapp_backends;
CREATE TRIGGER trg_whatsapp_backends_updated_at
BEFORE UPDATE ON public.whatsapp_backends
FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_backends_updated_at();

CREATE OR REPLACE FUNCTION public.get_whatsapp_backend_safe(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  name text,
  base_url text,
  has_credentials boolean,
  status text,
  last_check_at timestamptz,
  last_error_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin boolean := public.has_role('super_admin'::public.app_role);
  v_tenant uuid;
BEGIN
  IF v_is_super_admin THEN
    v_tenant := COALESCE(_tenant_id, public.get_user_tenant_id());
  ELSE
    v_tenant := public.get_user_tenant_id();
  END IF;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.id, b.tenant_id, b.name::text, b.base_url::text,
         (b.api_token IS NOT NULL OR b.auth_email IS NOT NULL) AS has_credentials,
         b.status::text, b.last_check_at, b.last_error_message::text
  FROM public.whatsapp_backends b
  WHERE b.tenant_id = v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_backend_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_backend_safe(uuid) TO authenticated, service_role;