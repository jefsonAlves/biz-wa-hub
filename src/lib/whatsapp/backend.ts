import { supabase } from "@/integrations/supabase/client";

/**
 * Conexão WhatsApp pelo backend próprio.
 * Fluxo: Frontend → Edge Function → Backend Node.js → Baileys/WuzAPI → WhatsApp.
 * n8n não participa do fluxo principal e permanece apenas como automação opcional.
 * Docker também não é requisito lógico: o backend pode rodar com ou sem container.
 */

export type DirectWhatsAppProvider = "baileys" | "wuzapi";

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-backend-proxy", { body });
  if (error) {
    const context = (error as any)?.context;
    throw new Error(context?.error || context?.details || error.message);
  }
  if (data?.error) throw new Error(data.details || data.message || data.error);
  return data as T;
}

export async function createBackendConnection(params: {
  tenantId?: string | null;
  name: string;
  provider?: DirectWhatsAppProvider;
  wuzapiUrl?: string;
  wuzapiToken?: string;
}) {
  return callProxy<{
    success: boolean;
    connection_id: string;
    remote_id: string | null;
    provider?: DirectWhatsAppProvider;
    delivered_via?: string;
  }>({
    action: "create_connection",
    tenant_id: params.tenantId ?? null,
    name: params.name,
    provider: params.provider ?? "baileys",
    ...(params.provider === "wuzapi" && params.wuzapiUrl ? { wuzapi_url: params.wuzapiUrl } : {}),
    ...(params.provider === "wuzapi" && params.wuzapiToken ? { wuzapi_token: params.wuzapiToken } : {}),
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
  return callProxy<{
    success: boolean;
    status?: string;
    has_qr?: boolean;
    phone_number?: string | null;
    message?: string;
  }>({
    action,
    connection_id: connectionId,
    tenant_id: tenantId ?? null,
  });
}
