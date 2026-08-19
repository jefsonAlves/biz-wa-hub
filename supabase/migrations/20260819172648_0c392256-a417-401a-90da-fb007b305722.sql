CREATE OR REPLACE FUNCTION public.handle_message_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.direction = 'incoming' AND NEW.role = 'contact' THEN
    UPDATE public.conversations
    SET unread_count = COALESCE(unread_count, 0) + 1,
        last_message_at = NEW.created_at,
        last_message_direction = 'incoming',
        awaiting_reply = true,
        last_customer_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  ELSIF NEW.direction = 'outgoing' THEN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_direction = 'outgoing',
        awaiting_reply = false,
        last_agent_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_message_unread() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.conversations
  SET unread_count = 0
  WHERE id = conv_id
    AND (tenant_id = public.get_user_tenant_id() OR public.has_role('super_admin'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated, service_role;