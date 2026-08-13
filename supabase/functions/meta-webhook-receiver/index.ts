import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, json, serviceClient } from "../_shared/n8n.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const verifyToken = url.searchParams.get("hub.verify_token");
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");

    // WEBHOOK VERIFICATION (GET)
    if (req.method === "GET") {
      const WEBHOOK_VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "zapflow-meta-token";
      if (mode === "subscribe" && verifyToken === WEBHOOK_VERIFY_TOKEN) {
        console.log("Meta Webhook Verified");
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    // WEBHOOK PAYLOAD (POST)
    const body = await req.json();
    console.log("Meta Webhook Payload:", JSON.stringify(body, null, 2));

    const svc = serviceClient();

    // Processar mensagens recebidas e atualizações de status
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (change.field !== "messages") continue;

          // 1. Encontrar a conexão baseada no phone_number_id
          const phoneNumberId = value.metadata?.phone_number_id;
          const { data: connection } = await svc
            .from("whatsapp_connections")
            .select("id, tenant_id")
            .eq("phone_number_id", phoneNumberId)
            .maybeSingle();

          if (!connection) {
            console.warn(`Mensagem recebida para Phone Number ID não cadastrado: ${phoneNumberId}`);
            continue;
          }

          // 2. Processar Mensagens
          if (value.messages) {
            for (const msg of value.messages) {
              const contact = value.contacts?.[0];
              const from = msg.from;
              const text = msg.text?.body || (msg.type === "image" ? "[Imagem]" : "[Mídia]");

              // Registrar evento de entrada para processamento assíncrono (Inbox/Realtime)
              await svc.from("inbound_events").insert({
                tenant_id: connection.tenant_id,
                connection_id: connection.id,
                event_type: "meta.message.received",
                payload: {
                  from,
                  name: contact?.profile?.name || from,
                  text,
                  timestamp: msg.timestamp,
                  message_id: msg.id,
                  raw: msg
                }
              });
            }
          }

          // 3. Processar Status (Sent, Delivered, Read)
          if (value.statuses) {
            for (const status of value.statuses) {
              await svc.from("inbound_events").insert({
                tenant_id: connection.tenant_id,
                connection_id: connection.id,
                event_type: "meta.message.status",
                payload: {
                  message_id: status.id,
                  status: status.status, // sent, delivered, read, failed
                  timestamp: status.timestamp,
                  recipient_id: status.recipient_id
                }
              });
            }
          }
        }
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("meta-webhook-receiver error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});