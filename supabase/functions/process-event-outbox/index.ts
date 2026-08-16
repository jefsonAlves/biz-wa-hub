import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, deliverEvent, getIntegration, json, PlatformEvent, serviceClient } from "../_shared/n8n.ts";

const BATCH = 25;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const svc = serviceClient();
    // Atomically leases rows so overlapping cron invocations cannot send the
    // same event concurrently. Expired processing leases are reclaimed by SQL.
    const { data: pending, error } = await svc.rpc("claim_event_outbox", {
      batch_size: BATCH,
    });
    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const row of pending ?? []) {
      const integration = await getIntegration(svc, row.tenant_id || undefined);


      const attempts = (row.attempts ?? 0) + 1;

      if (!integration) {
        await svc.from("event_outbox").update({
          attempts, status: attempts >= (row.max_attempts ?? 5) ? "dead" : "pending",
          last_error: "Integração n8n não configurada",
          next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        }).eq("id", row.id);
        
        if (row.payload?.connection_id) {
          await svc.from("whatsapp_connections")
            .update({ connection_error: "n8n não configurado para este tenant" })
            .eq("id", row.payload.connection_id);
        }
        
        failed++;
        continue;
      }

      const result = await deliverEvent(svc, row.payload as PlatformEvent, integration);

      if (result.success || result.status === 202 || result.status === 200 || result.status === 201) {
        await svc.from("event_outbox").update({
          status: "sent", attempts, processed_at: new Date().toISOString(), last_error: null,
        }).eq("id", row.id);
        
        // Clear previous errors if successful
        if (row.payload?.connection_id) {
           await svc.from("whatsapp_connections")
            .update({ connection_error: null })
            .eq("id", row.payload.connection_id);
        }
        
        sent++;
      } else {
        const dead = attempts >= (row.max_attempts ?? 5);
        const errorMessage = result.error ? `${result.error}${result.body ? `: ${result.body}` : ""}` : "Erro desconhecido";
        
        await svc.from("event_outbox").update({
          status: dead ? "dead" : "pending",
          attempts,
          last_error: errorMessage.slice(0, 500),
          next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        }).eq("id", row.id);

        if (row.payload?.connection_id) {
          const userFriendlyError = result.status === 404 ? "URL do n8n não encontrada (404)" : 
                                   result.status === 401 ? "Erro de autenticação no n8n" :
                                   errorMessage.includes("dns") ? "Erro de DNS: Túnel expirado" :
                                   `Erro n8n (${result.status ?? "ERR"}): ${errorMessage.slice(0, 100)}`;
          
          await svc.from("whatsapp_connections")
            .update({ 
              connection_error: userFriendlyError
            })
            .eq("id", row.payload.connection_id);
        }
        failed++;
      }
    }

    return json({ success: true, processed: pending?.length ?? 0, sent, failed });
  } catch (error) {
    console.error("process-event-outbox error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});

function backoffMs(attempts: number) {
  // 30s, 1m, 2m, 4m, 8m... (capped at 2h)
  return Math.min(30_000 * Math.pow(2, attempts - 1), 7_200_000);
}
