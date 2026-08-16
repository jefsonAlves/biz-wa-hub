import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, hmacSha256Hex, json, serviceClient, signaturePayload,
  timingSafeEqual, webhookSecret,
} from "../_shared/n8n.ts";

const MAX_SKEW_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const rawBody = await req.text();
    const eventId = req.headers.get("X-Event-Id") ?? "";
    const timestamp = req.headers.get("X-Timestamp") ?? "";
    const signature = (req.headers.get("X-Signature") ?? "").toLowerCase();
    if (!UUID_PATTERN.test(eventId) || !timestamp || !signature) {
      return json({ error: "missing_or_invalid_headers" }, 400);
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) {
      return json({ error: "expired_timestamp" }, 401);
    }
    const secret = webhookSecret();
    if (!secret) return json({ error: "webhook_secret_not_configured" }, 503);
    const expected = await hmacSha256Hex(secret, signaturePayload(timestamp, eventId, rawBody));
    if (!timingSafeEqual(expected, signature)) return json({ error: "invalid_signature" }, 401);

    const body = JSON.parse(rawBody || "{}");
    const svc = serviceClient();

    if (body.action === "claim") {
      const limit = Math.max(1, Math.min(Number(body.limit) || 10, 25));
      const { data, error } = await svc.rpc("claim_event_outbox", { batch_size: limit });
      if (error) throw error;
      return json({
        ok: true,
        events: (data ?? []).map((row: Record<string, unknown>) => ({
          event_id: row.id,
          attempts: row.attempts,
          payload: row.payload,
        })),
      });
    }

    if (body.action === "ack") {
      const results = Array.isArray(body.results) ? body.results.slice(0, 25) : [];
      for (const result of results) {
        if (!UUID_PATTERN.test(String(result.event_id ?? ""))) continue;
        const { data: current } = await svc.from("event_outbox")
          .select("attempts")
          .eq("id", result.event_id)
          .maybeSingle();
        const attempts = (current?.attempts ?? 0) + 1;
        if (result.success === true) {
          await svc.from("event_outbox").update({
            status: "sent",
            attempts,
            processed_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", result.event_id);
        } else {
          const retrySeconds = Math.min(900, 15 * (2 ** Math.min(attempts, 6)));
          await svc.from("event_outbox").update({
            status: "pending",
            attempts,
            last_error: String(result.error ?? "n8n_processing_failed").slice(0, 500),
            next_retry_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
          }).eq("id", result.event_id);
        }
      }
      return json({ ok: true, acknowledged: results.length });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Log full error internally
    console.error("n8n-poll-events critical error:", message);
    
    // Return sanitized detail for n8n diagnostics
    // We remove potential sensitive info like stack traces or URLs
    const sanitizedDetail = message.length > 200 ? message.slice(0, 200) + "..." : message;
    
    return json({ 
      error: "internal_error",
      detail: sanitizedDetail 
    }, 500);
  }
});

