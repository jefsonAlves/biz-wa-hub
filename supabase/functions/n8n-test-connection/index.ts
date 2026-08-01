import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, getIntegration, isTenantAdmin, json, maskUrl, serviceClient, targetUrl } from "../_shared/n8n.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const svc = serviceClient();
    if (!(await isTenantAdmin(svc, auth.userId, auth.tenantId))) {
      return json({ error: "Forbidden" }, 403);
    }

    const integration = await getIntegration(svc, auth.tenantId);
    if (!integration) return json({ error: "Integração n8n não configurada" }, 400);

    const url = targetUrl(integration);
    if (!url) return json({ error: "URL base do n8n não configurada" }, 400);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(integration.base_url ?? "")) {
      return json({ error: "URL local não é válida em produção. Use a URL pública do n8n." }, 400);
    }

    const started = Date.now();
    let httpStatus: number | null = null;
    let ok = false;
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "integration.ping", tenant_id: auth.tenantId, version: 1 }),
      });
      clearTimeout(timer);
      httpStatus = resp.status;
      ok = resp.status < 500;
      if (!ok) errorMessage = `HTTP ${resp.status}`;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "erro de rede";
    }

    const nowIso = new Date().toISOString();
    await svc.from("n8n_integrations").update({
      last_tested_at: nowIso,
      ...(ok ? { last_success_at: nowIso } : { last_error_at: nowIso, last_error_message: errorMessage }),
    }).eq("id", integration.id);

    await svc.from("webhook_delivery_attempts").insert({
      tenant_id: auth.tenantId,
      target: maskUrl(url),
      http_status: httpStatus,
      duration_ms: Date.now() - started,
      success: ok,
      error_message: errorMessage,
    });

    return json({ success: ok, http_status: httpStatus, target: maskUrl(url), error: errorMessage });
  } catch (error) {
    console.error("n8n-test-connection error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});
