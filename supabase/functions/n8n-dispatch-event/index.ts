import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildEvent, corsHeaders, deliverEvent, enqueueEvent, getIntegration, json, serviceClient } from "../_shared/n8n.ts";

const ALLOWED = new Set([
  "whatsapp.connection.create",
  "whatsapp.connection.qr.request",
  "whatsapp.connection.status.request",
  "whatsapp.connection.disconnect",
  "whatsapp.connection.reconnect",
  "whatsapp.message.send",
  "whatsapp.media.send",
  "conversation.assigned",
  "conversation.transferred",
  "automation.requested",
  "human.handoff.requested",
  "system.integration.test",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.event_type !== "string" || !ALLOWED.has(body.event_type)) {
      return json({ error: "event_type inválido" }, 400);
    }

    const svc = serviceClient();

    // Connection must belong to the tenant when provided
    if (body.connection_id) {
      const { data: conn } = await svc
        .from("whatsapp_connections")
        .select("id")
        .eq("id", body.connection_id)
        .eq("tenant_id", auth.tenantId)
        .maybeSingle();
      if (!conn) return json({ error: "Conexão não encontrada" }, 404);
    }

    const event = buildEvent({
      event_type: body.event_type,
      tenant_id: auth.tenantId,
      connection_id: body.connection_id ?? null,
      conversation_id: body.conversation_id ?? null,
      data: typeof body.data === "object" && body.data ? body.data : {},
    });

    await enqueueEvent(svc, event, { type: body.aggregate_type ?? "manual", id: body.connection_id ?? null });

    const integration = await getIntegration(svc, auth.tenantId || undefined);
    if (!integration) return json({ success: true, queued: true, event_id: event.event_id });

    const result = await deliverEvent(svc, event, integration);
    await svc.from("event_outbox").update(
      result.success
        ? { status: "sent", processed_at: new Date().toISOString(), attempts: 1 }
        : { status: "pending", attempts: 1, last_error: result.error, next_retry_at: new Date(Date.now() + 30000).toISOString() },
    ).eq("id", event.event_id);

    return json({ success: result.success, event_id: event.event_id, error: result.error });
  } catch (error) {
    console.error("n8n-dispatch-event error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});
