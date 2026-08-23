-- Backend credentials are server-only. Edge Functions use service_role, which
-- bypasses RLS; browser sessions must never read this table directly.
DROP POLICY IF EXISTS "Backends visiveis para a propria empresa"
  ON public.whatsapp_backends;

REVOKE ALL ON TABLE public.whatsapp_backends FROM anon;
REVOKE ALL ON TABLE public.whatsapp_backends FROM authenticated;
GRANT ALL ON TABLE public.whatsapp_backends TO service_role;
