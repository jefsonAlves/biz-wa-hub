# Plan: Super Admin Tenant Selection for n8n and WhatsApp Connections

Implement tenant selection for Super Admins in the n8n Integration and WhatsApp Connections screens to allow managing configurations for specific companies.

## Technical Details

### 1. Database Migrations
- Apply RLS policies to allow Super Admins (`admin` role) to view and manage `whatsapp_connections` and `n8n_integrations` across all tenants.
- Ensure proper `GRANT` statements are in place.

### 2. Frontend Updates

#### WhatsApp Connections (`src/pages/Connections.tsx`)
- (Already partially implemented) Verify and refine the tenant selector.
- Ensure session creation and QR generation commands pass the correct `tenant_id`.

#### n8n Integration (`src/pages/N8nIntegration.tsx`)
- Add a "Company Managed" (Empresa administrada) selector for Super Admins.
- Update the integration query and save mutation to use the selected `tenant_id`.
- Set default webhook path to `/webhook/biz-wa-hub/platform`.
- Ensure the "Return Webhook" field remains read-only.
- Implement a test connection button that respects the selected tenant.

### 3. Verification
- Verify the Super Admin can switch between tenants and see their specific connections/integrations.
- Test that saving an n8n configuration for a tenant doesn't overwrite the global configuration.
- Test the "Test connection" flow for a specific tenant.
