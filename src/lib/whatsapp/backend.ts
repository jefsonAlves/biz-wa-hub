import { supabase } from "@/integrations/supabase/client";

/**
 * Conexão WhatsApp pelo backend próprio.
 * Cadastro local: Frontend -> Supabase.
 * Conexão real: Frontend -> Edge Function -> Backend Node.js -> Baileys/WuzAPI -> WhatsApp.
 * n8n não participa do fluxo principal.
 */

export type DirectWhatsAppProvider = "baileys" | "wuzapi";

type ProxyErrorPayload = {
  error?: string;
  message?: string;
  details?: string;
};

function normalizeServiceError(raw: string): string {
  const text = String(raw || "");
  
  // Se contiver a string de sincronização solicitada, retorna exatamente ela sem alterações.
  if (text.includes("verifique o motivo desse erro fatal") || text.includes("d7910ac09e1baa999d83727c364180036574ef24")) {
    return text;
  }

  if (
    text.includes("backend_not_configured") ||
    text.includes("backend_service_unavailable") ||
    text.includes("upgrade aplicado7") ||
    text.includes("RUNTIME_ERROR")
  ) {
    return text;
  }

  if (
    text.includes("Edge function returned 503") ||
    text.includes("Edge function returned 409")
  ) {
    return "O serviço do WhatsApp está temporariamente indisponível. Tente novamente em alguns instantes.";
  }

  if (text.includes("unauthorized") || text.includes("HTTP 401")) {
    return "A autenticação entre o Supabase e o serviço WhatsApp falhou. Verifique o token interno da plataforma.";
  }

  return text.length > 5000 ? `${text.slice(0, 5000)}…` : text;
}

async function readFunctionError(error: any): Promise<string> {
  const context = error?.context;
  try {
    if (context && typeof context.json === "function") {
      const payload = (await context.clone().json()) as ProxyErrorPayload;
      return normalizeServiceError(payload.message || payload.details || payload.error || error.message);
    }
  } catch {
    // Usa a mensagem padrão abaixo.
  }

  return normalizeServiceError(
    context?.message || context?.details || error?.message || "Falha ao comunicar com o serviço de WhatsApp.",
  );
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-backend-proxy", { body });
  if (error) throw new Error(await readFunctionError(error));
  if (data?.error) throw new Error(normalizeServiceError(data.message || data.details || data.error));
  return data as T;
}

/**
 * O cadastro NÃO chama Edge Function e NÃO exige backend/n8n/Docker.
 * A sessão remota só será criada quando o usuário clicar em Conectar WhatsApp.
 */
export async function createBackendConnection(params: {
  tenantId?: string | null;
  name: string;
  provider?: DirectWhatsAppProvider;
  wuzapiUrl?: string;
  wuzapiToken?: string;
}) {
  if (!params.tenantId) throw new Error("Empresa não identificada.");

  const provider = params.provider ?? "baileys";
  const providerType: "baileys_backend" | "wuzapi_backend" =
    provider === "baileys" ? "baileys_backend" : "wuzapi_backend";

  const metadata: Record<string, unknown> = {
    backend_provider: provider,
    pending_backend: true,
  };

  if (provider === "wuzapi") {
    if (params.wuzapiUrl) metadata.wuzapi_url = params.wuzapiUrl;
    if (params.wuzapiToken) metadata.wuzapi_token_configured = true;
  }

  const { data, error } = await supabase
    .from("whatsapp_connections")
    .insert({
      tenant_id: params.tenantId as any,
      name: params.name.trim() || "WhatsApp",
      provider_type: providerType,
      metadata,
    } as any)
    .select("id")
    .single();

  if (error) throw new Error(`Não foi possível cadastrar a conexão: ${error.message}`);

  return {
    success: true,
    connection_id: "",
    registered_connection_id: data.id,
    remote_id: null,
    provider,
    backend_configured: true,
    auto_connect: false,
    message: "Conexão cadastrada. Clique em Conectar WhatsApp para gerar o QR Code.",
  };
}

export type BackendConnectionAction =
  | "health"
  | "start_session"
  | "refresh_status"
  | "disconnect"
  | "delete_session";

type ConnectionActionResult = {
  success: boolean;
  status?: string;
  has_qr?: boolean;
  phone_number?: string | null;
  message?: string;
  backend_configured?: boolean;
  backend_status?: number;
  service?: string | null;
  sessions?: number | null;
};

export async function runBackendConnectionAction(
  connectionId: string,
  action: Exclude<BackendConnectionAction, "health">,
  tenantId?: string | null,
) {
  const result = await callProxy<ConnectionActionResult>({
    action,
    connection_id: connectionId,
    tenant_id: tenantId ?? null,
  });

  if (result.backend_configured === false && action === "start_session") {
    throw new Error(
      result.message ||
        "O serviço WhatsApp ainda não está configurado no Supabase. Verifique os Secrets da plataforma.",
    );
  }

  return result;
}

export async function checkWhatsAppBackend(tenantId?: string | null) {
  return callProxy<ConnectionActionResult>({
    action: "health",
    tenant_id: tenantId ?? null,
  });
}
