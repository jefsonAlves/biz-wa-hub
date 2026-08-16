-- Administrative actions for managing the event outbox

-- Function to reprocess pending or failed events
CREATE OR REPLACE FUNCTION public.reprocess_n8n_outbox(_tenant_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_count int;
BEGIN
    -- Only allow if the caller is super_admin
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RAISE EXCEPTION 'Apenas Super Admin pode reprocessar a fila global';
    END IF;

    UPDATE public.event_outbox
    SET 
        status = 'pending',
        last_error = NULL,
        next_retry_at = now(),
        attempts = 0 -- Reset attempts to allow full retry cycle
    WHERE 
        status IN ('pending', 'failed', 'error', 'processing')
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'affected_count', affected_count,
        'message', 'Fila reiniciada para processamento'
    );
END;
$$;

-- Function to archive dead/old events
CREATE OR REPLACE FUNCTION public.archive_dead_events(_days_old int DEFAULT 7, _tenant_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_count int;
BEGIN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RAISE EXCEPTION 'Apenas Super Admin pode arquivar eventos';
    END IF;

    UPDATE public.event_outbox
    SET status = 'archived'
    WHERE 
        status = 'dead'
        AND created_at < (now() - (_days_old || ' days')::interval)
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'affected_count', affected_count,
        'message', 'Eventos mortos arquivados'
    );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.reprocess_n8n_outbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_dead_events(int, uuid) TO authenticated;
