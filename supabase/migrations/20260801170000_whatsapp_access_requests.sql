-- Approval-based access requests initiated from WhatsApp.
-- A phone number alone never grants application access.

DO $$ BEGIN
  CREATE TYPE public.whatsapp_access_request_status AS ENUM
    ('pending', 'approved', 'rejected', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  requested_role text NOT NULL DEFAULT 'agent' CHECK (requested_role IN ('agent', 'viewer')),
  status public.whatsapp_access_request_status NOT NULL DEFAULT 'pending',
  request_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  approved_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_access_requests_one_pending_idx
  ON public.whatsapp_access_requests (tenant_id, connection_id, contact_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS whatsapp_access_requests_monitor_idx
  ON public.whatsapp_access_requests (tenant_id, status, created_at DESC);

ALTER TABLE public.whatsapp_access_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.whatsapp_access_requests TO authenticated;
GRANT ALL ON public.whatsapp_access_requests TO service_role;

CREATE POLICY "access requests tenant admins read"
  ON public.whatsapp_access_requests FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin'))
  );

CREATE POLICY "access requests tenant admins update"
  ON public.whatsapp_access_requests FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.has_role_in_tenant(tenant_id, 'tenant_admin') OR public.has_role('super_admin'))
  );

CREATE TRIGGER whatsapp_access_requests_updated_at
  BEFORE UPDATE ON public.whatsapp_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.review_whatsapp_access_request(
  _request_id uuid,
  _decision public.whatsapp_access_request_status,
  _user_id uuid DEFAULT NULL,
  _can_reply boolean DEFAULT true,
  _can_manage boolean DEFAULT false
) RETURNS public.whatsapp_access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  request_row public.whatsapp_access_requests;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;

  SELECT * INTO request_row
  FROM public.whatsapp_access_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF request_row.id IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF request_row.tenant_id <> public.get_user_tenant_id() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT (public.has_role_in_tenant(request_row.tenant_id, 'tenant_admin') OR public.has_role('super_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF request_row.status <> 'pending' THEN RAISE EXCEPTION 'request already reviewed'; END IF;
  IF request_row.expires_at <= now() THEN
    UPDATE public.whatsapp_access_requests SET status = 'expired' WHERE id = _request_id;
    RAISE EXCEPTION 'request expired';
  END IF;
  IF _decision = 'approved' AND _user_id IS NULL THEN RAISE EXCEPTION 'user id required for approval'; END IF;

  IF _decision = 'approved' THEN
    INSERT INTO public.user_connection_access
      (tenant_id, user_id, connection_id, can_view, can_reply, can_manage)
    VALUES
      (request_row.tenant_id, _user_id, request_row.connection_id, true, _can_reply, _can_manage)
    ON CONFLICT (user_id, connection_id) DO UPDATE SET
      can_view = true,
      can_reply = EXCLUDED.can_reply,
      can_manage = EXCLUDED.can_manage;
  END IF;

  UPDATE public.whatsapp_access_requests SET
    status = _decision,
    approved_user_id = CASE WHEN _decision = 'approved' THEN _user_id ELSE NULL END,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = _request_id
  RETURNING * INTO request_row;

  INSERT INTO public.event_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    request_row.tenant_id,
    CASE WHEN _decision = 'approved' THEN 'whatsapp.access.approved' ELSE 'whatsapp.access.rejected' END,
    'whatsapp_access_request',
    request_row.id,
    jsonb_build_object(
      'event_id', gen_random_uuid(),
      'event_type', CASE WHEN _decision = 'approved' THEN 'whatsapp.access.approved' ELSE 'whatsapp.access.rejected' END,
      'tenant_id', request_row.tenant_id,
      'connection_id', request_row.connection_id,
      'conversation_id', request_row.conversation_id,
      'occurred_at', now(),
      'source', 'platform',
      'version', 1,
      'data', jsonb_build_object('request_id', request_row.id, 'status', _decision)
    )
  );

  RETURN request_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_whatsapp_access_request(uuid, public.whatsapp_access_request_status, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_whatsapp_access_request(uuid, public.whatsapp_access_request_status, uuid, boolean, boolean) TO authenticated;
