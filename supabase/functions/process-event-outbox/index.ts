import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, deliverEvent, json, PlatformEvent, serviceClient } from "../_shared/n8n.ts";

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
      const { data: integration } = await svc
        .from("n8n_integrations")
        .select("base_url, webhook_path, status")
        .eq("tenant_id", row.tenant_id)
        .maybeSingle();

      const attempts = (row.attempts ?? 0) + 1;

      if (!integration) {
        await svc.from("event_outbox").update({
          attempts, status: attempts >= row.max_attempts ? "dead" : "pending",
          last_error: "IntegraÃ§Ã£o n8n nÃ£o configurada",
          next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        }).eq("id", row.id);
        failed++;
        continue;
      }

      const result = await deliverEvent(svc, row.payload as PlatformEvent, integration);

      if (result.success) {
        await svc.from("event_outbox").update({
          status: "sent", attempts, processed_at: new Date().toISOString(), last_error: null,
        }).eq("id", row.id);
        sent++;
      } else {
        const dead = attempts >= (row.max_attempts ?? 5);
        await svc.from("event_outbox").update({
          status: dead ? "dead" : "pending",
          attempts,
          last_error: (result.error ?? "erro desconhecido").slice(0, 500),
          next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        }).eq("id", row.id);
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

