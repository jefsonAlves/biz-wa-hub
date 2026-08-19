// Camada de acesso ao backend próprio de WhatsApp (Baileys/Whaticket).
// Nunca expõe tokens: apenas as Edge Functions leem a tabela whatsapp_backends.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BackendConfig {
  id: string;
  tenant_id: string;
  name: string;
  base_url: string;
  api_token: string | null;
  auth_email: string | null;
  auth_password: string | null;
  session_token: string | null;
  session_token_expires_at: string | null;
  /** false quando a configuração vem de variáveis de ambiente (não há linha no banco). */
  persisted?: boolean;
}

export function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("A URL do backend deve usar http ou https.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Resolve o backend WhatsApp da plataforma.
 * Prioridade: segredos do servidor (WHATSAPP_BACKEND_URL/TOKEN) → linha legada por tenant.
 * O usuário final nunca informa URL, e-mail, senha ou token.
 */
export async function getBackend(
  svc: SupabaseClient,
  tenantId: string,
): Promise<BackendConfig | null> {
  const envUrl = Deno.env.get("WHATSAPP_BACKEND_URL");
  if (envUrl?.trim()) {
    return {
      id: "env",
      tenant_id: tenantId,
      name: "Backend WhatsApp",
      base_url: envUrl.trim(),
      api_token: Deno.env.get("WHATSAPP_BACKEND_TOKEN")?.trim() || null,
      auth_email: Deno.env.get("WHATSAPP_BACKEND_EMAIL")?.trim() || null,
      auth_password: Deno.env.get("WHATSAPP_BACKEND_PASSWORD") || null,
      session_token: null,
      session_token_expires_at: null,
      persisted: false,
    };
  }

  const { data } = await svc
    .from("whatsapp_backends")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? ({ ...(data as BackendConfig), persisted: true }) : null;
}


export function humanizeBackendError(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("dns error") || lowered.includes("failed to lookup address")) {
    return "URL do backend inacessível (DNS). Verifique se o endereço público está no ar.";
  }
  if (lowered.includes("connection refused") || lowered.includes("tcp connect error")) {
    return "O backend recusou a conexão. Confirme se ele está rodando e exposto na porta correta.";
  }
  if (lowered.includes("certificate") || lowered.includes("invalid peer")) {
    return "Certificado HTTPS inválido no backend.";
  }
  if (lowered.includes("timed out") || lowered.includes("aborted")) {
    return "O backend não respondeu no tempo limite.";
  }
  return message.slice(0, 300);
}

/** Faz login no backend e guarda o token de sessão (válido ~12h). */
async function login(svc: SupabaseClient, backend: BackendConfig): Promise<string> {
  if (!backend.auth_email || !backend.auth_password) {
    throw new Error("Credenciais do backend não configuradas (token ou e-mail/senha).");
  }
  const resp = await backendFetch(backend, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: backend.auth_email, password: backend.auth_password }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.token) {
    throw new Error(`Login no backend falhou (HTTP ${resp.status}).`);
  }
  const token = String(body.token);
  await svc
    .from("whatsapp_backends")
    .update({
      session_token: token,
      session_token_expires_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", backend.id);
  return token;
}

/** Token de autorização para chamadas autenticadas no backend. */
export async function resolveToken(svc: SupabaseClient, backend: BackendConfig): Promise<string> {
  if (backend.api_token) return backend.api_token;
  const expires = backend.session_token_expires_at
    ? new Date(backend.session_token_expires_at).getTime()
    : 0;
  if (backend.session_token && expires > Date.now()) return backend.session_token;
  return await login(svc, backend);
}

export async function backendFetch(
  backend: BackendConfig,
  path: string,
  init: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<Response> {
  const base = normalizeBaseUrl(backend.base_url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
  try {
    return await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Chamada autenticada com retry único quando o token expirou. */
export async function backendCall(
  svc: SupabaseClient,
  backend: BackendConfig,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: any }> {
  let token = await resolveToken(svc, backend);
  let resp = await backendFetch(backend, path, { ...init, token });

  if (resp.status === 401 && !backend.api_token) {
    token = await login(svc, { ...backend, session_token: null, session_token_expires_at: null });
    resp = await backendFetch(backend, path, { ...init, token });
  }

  const text = await resp.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: resp.status, body };
}

/** Traduz o status do backend Whaticket/Baileys para o status da plataforma. */
export function mapBackendStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "CONNECTED":
      return "connected";
    case "QRCODE":
      return "qr_pending";
    case "OPENING":
    case "PAIRING":
      return "connecting";
    case "TIMEOUT":
    case "DISCONNECTED":
      return "disconnected";
    case "PENDING":
      return "connecting";
    default:
      return "disconnected";
  }
}
