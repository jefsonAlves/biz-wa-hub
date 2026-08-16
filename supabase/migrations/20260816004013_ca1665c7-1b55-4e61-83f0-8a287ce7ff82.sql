-- Update existing reprocess_n8n_outbox to also include 'dead' events
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
        status IN ('pending', 'failed', 'error', 'processing', 'dead')
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'affected_count', affected_count,
        'message', 'Fila reiniciada para processamento'
    );
END;
$$;

-- Note: The other requirements (HTTP 202, UI labels, clean error messages) 
-- are already mostly implemented or were just updated in the frontend.
