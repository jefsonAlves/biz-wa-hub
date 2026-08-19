import { supabase } from "@/integrations/supabase/client";

/**
 * Conexão WhatsApp pelo backend próprio (Baileys).
 * Fluxo: Frontend → Edge Function → Backend Node.js → Baileys → WhatsApp.
 * A URL e o token do backend ficam apenas no servidor: o usuário final nunca
 * preenche URL, e-mail, senha ou token. n8n e Docker não participam deste fluxo.
 */

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-backend-proxy", { body });
  if (error) {
    const context = (error as any)?.context;
    throw new Error(context?.error || context?.details || error.message);
  }
  if (data?.error) throw new Error(data.details || data.message || data.error);
  return data as T;
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
