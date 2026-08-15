# Plan: Super Admin WhatsApp Connection Tenant Selection

Implement a tenant selector for Super Admins on the WhatsApp Connections page to allow them to manage connections for any tenant.

## Proposed Changes

### Database Migration
Create a new migration `supabase/migrations/20260815133000_super_admin_whatsapp_connections_by_tenant.sql`:
- Redefine `public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL)` function.
- Ensure it returns `tenant_id`.
- Allow Super Admins to query any tenant's connections by passing `_tenant_id`.
- Maintain existing security: mask sensitive data, protect credentials, only expose QR code through metadata.

### Frontend - WhatsApp Provider
Modify `src/lib/whatsapp/provider.ts`:
- Update `listConnections` to accept an optional `tenantId` parameter.
- Pass this `tenantId` to the `get_whatsapp_connections_safe` RPC.

### Frontend - Connections Page
Modify `src/pages/Connections.tsx`:
- Detect if the user is a Super Admin using `useAuth`.
- If Super Admin, fetch the list of all tenants (companies).
- Add a Select component to choose a "Managed Company" (Empresa administrada).
- Use the selected `tenantId` for listing, creating, and managing connections.
- Show a prompt if no company is selected.
- Maintain current behavior for regular users (using their own `tenant_id`).

### Deployment
- Apply the SQL migration.
- Redeploy the following Edge Functions to ensure they handle the tenant context correctly:
  - `whatsapp-connection-command`
  - `n8n-webhook-receiver`
  - `process-event-outbox`
  - `n8n-test-connection`

## Technical Details

### SQL Implementation
```sql
CREATE OR REPLACE FUNCTION public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    name text,
    phone_number text,
    provider_type text,
    status text,
    qr_status text,
    qr_code text,
    qr_expires_at timestamptz,
    webhook_status text,
    has_credentials boolean,
    last_connected_at timestamptz,
    last_disconnected_at timestamptz,
    last_health_check_at timestamptz,
    connection_error text,
    created_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_super_admin boolean := public.has_role(v_user_id, 'super_admin');
    v_profile_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO v_profile_tenant_id FROM public.profiles WHERE user_id = v_user_id;

    RETURN QUERY
    SELECT 
        wc.id,
        wc.tenant_id,
        wc.name,
        wc.phone_number,
        wc.provider_type,
        wc.status,
        (wc.metadata->>'qr_status')::text as qr_status,
        (wc.metadata->>'qr_code')::text as qr_code,
        (wc.metadata->>'qr_expires_at')::timestamptz as qr_expires_at,
        (wc.metadata->>'webhook_status')::text as webhook_status,
        (wc.provider_token IS NOT NULL OR wc.metadata->>'session_id' IS NOT NULL) as has_credentials,
        wc.last_connected_at,
        wc.last_disconnected_at,
        wc.last_health_check_at,
        (wc.metadata->>'connection_error')::text as connection_error,
        wc.created_at
    FROM public.whatsapp_connections wc
    WHERE 
        CASE 
            WHEN v_is_super_admin THEN 
                (_tenant_id IS NULL OR wc.tenant_id = _tenant_id)
            ELSE 
                wc.tenant_id = v_profile_tenant_id
        END;
END;
$$;
```

### Edge Function Redelivery
I will trigger redeployment of the relevant functions to ensure they are synchronized with the latest schema and logic.
