// Shared helpers for the n8n integration layer (Phase 1).
// Never log or return secrets from this module.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id, x-event-id, x-timestamp, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Validates the caller JWT and returns the user id + tenant id + isSuperAdmin flag. */
export async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized" as const };

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await anon.auth.getClaims(token);
  if (error || !data?.claims) return { error: "Unauthorized" as const };

  const userId = data.claims.sub as string;
  const svc = serviceClient();

  // Check if user is Super Admin
  const { data: roleData } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  const isSuperAdmin = !!roleData;

  const { data: profile } = await svc
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!isSuperAdmin && !profile?.tenant_id) return { error: "No tenant" as const };
  
  return { 
    userId, 
    tenantId: profile?.tenant_id as string | null,
    isSuperAdmin
  };
}

export async function isTenantAdmin(svc: SupabaseClient, userId: string, tenantId: string) {
  const { data } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["tenant_admin", "super_admin"]);
  return (data?.length ?? 0) > 0 && !!tenantId;
}

export const EVENT_VERSION = 1;

export interface PlatformEvent {
  event_id: string;
  event_type: string;
  tenant_id: string | null;
  connection_id: string | null;
  conversation_id: string | null;
  occurred_at: string;
  source: "platform" | "n8n";
  version: number;
  data: Record<string, unknown>;
}

export function buildEvent(params: {
  event_type: string;
  tenant_id: string | null;
  connection_id?: string | null;
  conversation_id?: string | null;
  data?: Record<string, unknown>;
}): PlatformEvent {
  return {
    event_id: crypto.randomUUID(),
    event_type: params.event_type,
    tenant_id: params.tenant_id,
    connection_id: params.connection_id ?? null,
    conversation_id: params.conversation_id ?? null,
    occurred_at: new Date().toISOString(),
    source: "platform",
    version: EVENT_VERSION,
    data: params.data ?? {},
  };
}

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function signaturePayload(timestamp: string, eventId: string, rawBody: string) {
  return `${timestamp}.${eventId}.${rawBody}`;
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function webhookSecret(): string | null {
  return Deno.env.get("N8N_WEBHOOK_SECRET") ?? null;
}

export function n8nApiKey(): string | null {
  return Deno.env.get("N8N_API_KEY") ?? null;
}

export function maskUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}/***`;
  } catch {
    return "***";
  }
}

/** Loads the active n8n integration (global or tenant-specific). */
export async function getIntegration(svc: SupabaseClient, tenantId?: string) {
  // First try to find a global active integration
  const { data: global } = await svc
    .from("n8n_integrations")
    .select("*")
    .is("tenant_id", null)
    .eq("status", "active")
    .maybeSingle();
  
  if (global) return global;

  // Fallback to tenant-specific (deprecated but maintained for backward compat)
  if (tenantId) {
    const { data: tenantSpecific } = await svc
      .from("n8n_integrations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return tenantSpecific;
  }
  
  return null;
}

export function targetUrl(integration: { base_url: string | null; webhook_path: string | null }) {
  if (!integration.base_url) return null;
  const base = integration.base_url.replace(/\/+$/, "");
  const path = (integration.webhook_path || "/webhook/platform").replace(/^\/?/, "/");
  return `${base}${path}`;
}

/** Enqueue an event into the outbox. Returns the event. */
export async function enqueueEvent(
  svc: SupabaseClient,
  event: PlatformEvent,
  aggregate?: { type: string; id: string | null },
) {
  await svc.from("event_outbox").insert({
    id: event.event_id,
    tenant_id: event.tenant_id,
    event_type: event.event_type,
    aggregate_type: aggregate?.type ?? null,
    aggregate_id: aggregate?.id ?? null,
    payload: event as unknown as Record<string, unknown>,
    status: "pending",
  });
  return event;
}

/** Signs and POSTs one event to n8n, recording the delivery attempt. */
export async function deliverEvent(
  svc: SupabaseClient,
  event: PlatformEvent,
  integration: { base_url: string | null; webhook_path: string | null; status: string },
): Promise<{ success: boolean; status?: number; error?: string; body?: string; url?: string }> {
  const url = targetUrl(integration);
  if (!url) return { success: false, error: "n8n base_url not configured" };
  if (integration.status !== "active") return { success: false, error: "n8n integration is inactive" };

  const secret = webhookSecret();
  if (!secret) return { success: false, error: "N8N_WEBHOOK_SECRET is not configured" };

  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256Hex(secret, signaturePayload(timestamp, event.event_id, rawBody));

  const started = Date.now();
  let httpStatus: number | null = null;
  let excerpt: string | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const apiKey = n8nApiKey();
    const resp = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": event.tenant_id ?? "00000000-0000-0000-0000-000000000000",
        "X-Event-Id": event.event_id,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
        ...(apiKey ? { "X-N8N-Api-Key": apiKey } : {}),
      },
      body: rawBody,
    });
    clearTimeout(timer);
    httpStatus = resp.status;
    const text = await resp.text();
    excerpt = text.slice(0, 500);
    success = resp.ok;
    if (!success) errorMessage = `HTTP ${resp.status}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "unknown fetch error";
  }

  await svc.from("webhook_delivery_attempts").insert({
    event_id: event.event_id,
    tenant_id: event.tenant_id,
    target: maskUrl(url),
    http_status: httpStatus,
    response_excerpt: excerpt,
    duration_ms: Date.now() - started,
    success,
    error_message: errorMessage,
  });

  const nowIso = new Date().toISOString();
  await svc
    .from("n8n_integrations")
    .update(success ? { last_success_at: nowIso } : { last_error_at: nowIso, last_error_message: errorMessage })
    .eq("tenant_id", event.tenant_id);

  return { success, status: httpStatus ?? undefined, error: errorMessage ?? undefined, body: excerpt ?? undefined, url };
}
