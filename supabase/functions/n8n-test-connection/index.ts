import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticate,
  buildEvent,
  corsHeaders,
  deliverEvent,
  getIntegration,
  json,
  maskUrl,
  serviceClient,
  webhookSecret,
} from "../_shared/n8n.ts";

/**
 * Edge Function: n8n-test-connection
 * Diagnóstico completo da comunicação com o n8n (nunca retorna segredos ou URL completa).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const svc = serviceClient();

    const { data: roles } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId);

    const isAdmin = (roles ?? []).some((r) =>
      r.role === "super_admin" || r.role === "tenant_admin"
    );
    if (!isAdmin) return json({ error: "Permissões insuficientes" }, 403);

    const body = await req.json().catch(() => null);
    const requestedTenantId = body?.tenant_id as string | undefined;
    const tenantId = auth.isSuperAdmin && requestedTenantId ? requestedTenantId : auth.tenantId;

    if (!tenantId) return json({ error: "tenant_id_required" }, 400);

    const integration = await getIntegration(svc, tenantId);
    const secretConfigured = !!webhookSecret();

    const diagnostics: Record<string, unknown> = {
      tenant_id: tenantId,
      integration: integration
        ? {
          found: true,
          name: integration.name as string,
          status: integration.status as string,
          scope: integration.tenant_id ? "tenant" : "global",
          target: maskUrl(integration.base_url as string | null),
          last_success_at: integration.last_success_at ?? null,
          last_error_at: integration.last_error_at ?? null,
          last_error_message: (integration.last_error_message as string | null) ?? null,
        }
        : { found: false },
      secret_configured: secretConfigured,
    };

    // Fila de saída
    const [{ count: pendingCount }, { count: failedCount }] = await Promise.all([
      svc.from("event_outbox").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).in("status", ["pending", "processing"]),
      svc.from("event_outbox").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).in("status", ["failed", "dead"]),
    ]);
    diagnostics.outbox = { pending: pendingCount ?? 0, failed: failedCount ?? 0 };

    // Última tentativa de entrega
    const { data: lastDelivery } = await svc
      .from("webhook_delivery_attempts")
      .select("created_at, success, http_status, error_message, duration_ms")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    diagnostics.last_delivery = lastDelivery ?? null;

    // Último callback recebido do n8n
    const { data: lastInbound } = await svc
      .from("inbound_events")
      .select("received_at, event_type, processing_status")
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    diagnostics.last_inbound_event = lastInbound ?? null;

    if (!integration || !secretConfigured) {
      diagnostics.webhook = {
        reachable: false,
        error: !integration
          ? "Nenhuma integração n8n ativa encontrada."
          : "Segredo de assinatura (HMAC) não configurado no servidor.",
      };
      return json({ success: false, diagnostics });
    }

    // Ping real ao n8n (entrega imediata, fora da fila)
    const started = Date.now();
    const testEvent = buildEvent({
      event_type: "platform.ping",
      tenant_id: tenantId,
      data: { timestamp: new Date().toISOString(), triggered_by: auth.userId, test: true },
    });
    const result = await deliverEvent(svc, testEvent, integration as never);

    diagnostics.webhook = {
      reachable: result.success,
      http_status: result.status ?? null,
      duration_ms: Date.now() - started,
      error: result.error ?? null,
      response_excerpt: result.body ? String(result.body).slice(0, 300) : null,
      target: maskUrl(integration.base_url as string | null),
    };

    return json({ success: result.success, diagnostics });
  } catch (error) {
    console.error("n8n-test-connection error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
