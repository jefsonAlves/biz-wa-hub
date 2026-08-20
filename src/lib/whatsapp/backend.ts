import { supabase } from "@/integrations/supabase/client";

/**
 * Conexão WhatsApp pelo backend próprio.
 * Fluxo: Frontend → Edge Function → Backend Node.js → Baileys/WuzAPI → WhatsApp.
 * n8n não participa do fluxo principal e permanece apenas como automação opcional.
 * Docker também não é requisito lógico: o backend pode rodar com ou sem container.
 */

export type DirectWhatsAppProvider = "baileys" | "wuzapi";

type ProxyErrorPayload = {
  error?: string;
  message?: string;
  details?: string;
};

async function readFunctionError(error: any): Promise<string> {
  const context = error?.context;

  try {
    if (context && typeof context.json === "function") {
      const payload = (await context.clone().json()) as ProxyErrorPayload;
      return payload.message || payload.details || payload.error || error.message;
    }
  } catch {
    // ignora e usa a mensagem padrão abaixo
  }

  return context?.message || context?.details || error?.message || "Falha ao comunicar com o serviço de WhatsApp.";
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-backend-proxy", { body });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  if (data?.error) {
    throw new Error(data.message || data.details || data.error);
  }

  return data as T;
}

export async function createBackendConnection(params: {
  tenantId?: string | null;
  name: string;
  provider?: DirectWhatsAppProvider;
  wuzapiUrl?: string;
  wuzapiToken?: string;
}) {
  const result = await callProxy<{
    success: boolean;
    connection_id: string;
    remote_id: string | null;
    provider?: DirectWhatsAppProvider;
    backend_configured?: boolean;
    auto_connect?: boolean;
    message?: string;
  }>({
    action: "create_connection",
    tenant_id: params.tenantId ?? null,
    name: params.name,
    provider: params.provider ?? "baileys",
    ...(params.provider === "wuzapi" && params.wuzapiUrl ? { wuzapi_url: params.wuzapiUrl } : {}),
    ...(params.provider === "wuzapi" && params.wuzapiToken ? { wuzapi_token: params.wuzapiToken } : {}),
  });

  // A tela atual chama connect() automaticamente quando recebe um connection_id.
  // Se o serviço Baileys ainda não estiver publicado/configurado, preservamos o
  // cadastro local e evitamos disparar uma tentativa que resultaria em erro 503.
  return {
    ...result,
    registered_connection_id: result.connection_id,
    connection_id: result.auto_connect === false ? "" : result.connection_id,
  };
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
    backend_configured?: boolean;
  }>({
    action,
    connection_id: connectionId,
    tenant_id: tenantId ?? null,
  });
}
