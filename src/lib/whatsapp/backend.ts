import { supabase } from "@/integrations/supabase/client";

/**
 * Backend próprio de WhatsApp (Baileys/Whaticket).
 * Fluxo: Frontend → Edge Function → Backend → Baileys → WhatsApp.
 * Não depende de n8n nem de Docker; o n8n é apenas automação opcional.
 */

export interface SafeBackend {
  id: string;
  tenant_id: string;
  name: string;
  base_url: string;
  has_credentials: boolean;
  status: string;
  last_check_at: string | null;
  last_error_message: string | null;
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-backend-proxy", { body });
  if (error) {
    const context = (error as any)?.context;
    throw new Error(context?.error || context?.details || error.message);
  }
  if (data?.error) throw new Error(data.details || data.message || data.error);
  return data as T;
}

export async function getBackendConfig(tenantId?: string | null): Promise<SafeBackend | null> {
  const { data, error } = await supabase.rpc("get_whatsapp_backend_safe", {
    _tenant_id: tenantId ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as SafeBackend[];
  return rows[0] ?? null;
}

export async function saveBackendConfig(params: {
  tenantId?: string | null;
  name?: string;
  baseUrl: string;
  apiToken?: string;
  authEmail?: string;
  authPassword?: string;
}) {
  return callProxy<{ success: boolean }>({
    action: "save_backend",
    tenant_id: params.tenantId ?? null,
    name: params.name,
    base_url: params.baseUrl,
    api_token: params.apiToken,
    auth_email: params.authEmail,
    auth_password: params.authPassword,
  });
}

export async function testBackendConfig(tenantId?: string | null) {
  return callProxy<{
    success: boolean;
    reachable: boolean;
    authorized?: boolean;
    http_status?: number;
    duration_ms?: number;
    sessions?: number | null;
    error?: string;
  }>({ action: "test_backend", tenant_id: tenantId ?? null });
}

export async function createBackendConnection(params: { tenantId?: string | null; name: string }) {
  return callProxy<{ success: boolean; connection_id: string; remote_id: string | null }>({
    action: "create_connection",
    tenant_id: params.tenantId ?? null,
    name: params.name,
  });
}

export type BackendConnectionAction =
  | "start_session"
  | "refresh_status"
  | "disconnect"
  | "delete_session";

export async function runBackendConnectionAction(
  connectionId: string,
  action: BackendConnectionAction,
  tenantId?: string | null,
) {
  return callProxy<{ success: boolean; status?: string; has_qr?: boolean; message?: string }>({
    action,
    connection_id: connectionId,
    tenant_id: tenantId ?? null,
  });
}
