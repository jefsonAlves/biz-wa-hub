
-- Add unique constraint on contacts for phone + tenant_id for upsert
ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_tenant_unique UNIQUE (phone, tenant_id);
