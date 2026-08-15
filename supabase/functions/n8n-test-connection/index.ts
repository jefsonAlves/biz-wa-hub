import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticate,
  buildEvent,
  corsHeaders,
  deliverEvent,
  getIntegration,
  isTenantAdmin,
  json,
  maskUrl,
  serviceClient,
  targetUrl,
} from "../_shared/n8n.ts";

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

    const event = buildEvent({
      event_type: "system.integration.test",
      tenant_id: auth.tenantId,
      data: { probe: true },
    });
    const result = await deliverEvent(svc, event, integration);

    await svc.from("n8n_integrations").update({ last_tested_at: new Date().toISOString() })
      .eq("id", integration.id);

    return json({
      success: result.success,
      event_id: event.event_id,
      http_status: result.status ?? null,
      target: maskUrl(url),
      error: result.error ?? null,
    }, result.success ? 200 : 502);
  } catch (error) {
    console.error("n8n-test-connection error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});
