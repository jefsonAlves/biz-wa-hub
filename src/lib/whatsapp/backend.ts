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
  if (text.includes("backend_not_configured")) {
    return "O serviço do WhatsApp ainda não está configurado no servidor. O cadastro foi preservado; publique/configure o backend Node.js com Baileys e tente Conectar novamente.";
  }
  if (text.includes("Edge function returned 503")) {
    return "O serviço do WhatsApp está temporariamente indisponível. O cadastro foi preservado; tente conectar novamente quando o backend estiver disponível.";
  }
  return text.length > 320 ? `${text.slice(0, 320)}…` : text;
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
  const providerType: "baileys_backend" | "custom" =
    provider === "baileys" ? "baileys_backend" : "custom";

  const metadata: any = {
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
      tenant_id: params.tenantId,
      name: params.name.trim() || "WhatsApp",
      provider_type: providerType,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Não foi possível cadastrar a conexão: ${error.message}`);
  }

  return {
    success: true,
    connection_id: "",
    registered_connection_id: data.id,
    remote_id: null,
    provider,
    backend_configured: false,
    auto_connect: false,
    message: "Conexão cadastrada. Agora clique em Conectar WhatsApp para gerar o QR Code.",
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
