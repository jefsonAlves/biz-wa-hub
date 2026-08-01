import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, hmacSha256Hex, json, serviceClient, sha256Hex,
  signaturePayload, timingSafeEqual, webhookSecret,
} from "../_shared/n8n.ts";

const INBOUND_TYPES = new Set([
  "whatsapp.connection.qr.generated",
  "whatsapp.connection.connected",
  "whatsapp.connection.disconnected",
  "whatsapp.connection.error",
  "whatsapp.message.received",
  "whatsapp.message.sent",
  "whatsapp.message.delivered",
  "whatsapp.message.read",
  "whatsapp.message.failed",
  "whatsapp.access.requested",
  "automation.reply",
  "automation.internal_note",
  "automation.assign",
  "automation.transfer",
  "automation.pause",
  "automation.resume",
  "automation.error",
]);

const MAX_SKEW_SECONDS = 300;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const svc = serviceClient();

  try {
    const declaredLength = Number(req.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
      return json({ error: "Payload muito grande" }, 413);
    }
    const rawBody = await req.text();
    const tenantId = req.headers.get("X-Tenant-Id");
    const eventId = req.headers.get("X-Event-Id");
    const timestamp = req.headers.get("X-Timestamp");
    const signature = req.headers.get("X-Signature");

    if (!tenantId || !eventId || !timestamp || !signature) {
      return json({ error: "Cabeçalhos obrigatórios ausentes" }, 400);
    }
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(eventId)) {
      return json({ error: "Identificadores inválidos" }, 400);
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
      return json({ error: "Payload muito grande" }, 413);
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) {
      return json({ error: "Timestamp expirado" }, 401);
    }

    const secret = webhookSecret();
    if (!secret) return json({ error: "Webhook secret não configurado" }, 503);

    const expected = await hmacSha256Hex(secret, signaturePayload(timestamp, eventId, rawBody));
    if (!timingSafeEqual(expected, signature.toLowerCase())) {
      return json({ error: "Assinatura inválida" }, 401);
    }

    const payload = JSON.parse(rawBody || "{}");
    if (typeof payload.event_type !== "string" || !INBOUND_TYPES.has(payload.event_type)) {
      return json({ error: "event_type inválido" }, 400);
    }
    if (payload.tenant_id && payload.tenant_id !== tenantId) {
      return json({ error: "Tenant incompatível" }, 401);
    }

    const { data: integration } = await svc
      .from("n8n_integrations")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!integration || integration.status !== "active") {
      return json({ error: "Integração inativa" }, 403);
    }

    // Idempotency: unique (source, external_event_id)
    const { error: insertError } = await svc.from("inbound_events").insert({
      tenant_id: tenantId,
      external_event_id: eventId,
      source: "n8n",
      event_type: payload.event_type,
      payload,
      payload_hash: await sha256Hex(rawBody),
      processing_status: "processing",
    });

    if (insertError) {
      if (insertError.code === "23505" || insertError.code === "23000" || /duplicate/i.test(insertError.message)) {
        return json({ ok: true, duplicate: true });
      }
      throw insertError;
    }

    const connectionId: string | null = payload.connection_id ?? null;
    const data = payload.data ?? {};
    const nowIso = new Date().toISOString();

    const updateConnection = async (patch: Record<string, unknown>) => {
      if (!connectionId) return;
      await svc.from("whatsapp_connections").update(patch).eq("id", connectionId).eq("tenant_id", tenantId);
    };

    switch (payload.event_type) {
      case "whatsapp.connection.qr.generated":
        await updateConnection({ qr_status: "available", status: "qr_pending", connection_error: null,
          metadata: { qr_code: data.qr_code ?? null, qr_expires_at: data.expires_at ?? null } });
        break;
      case "whatsapp.connection.connected":
        await updateConnection({ status: "connected", qr_status: "idle", connection_error: null,
          last_connected_at: nowIso, phone_number: data.phone_number ?? undefined,
          provider_session_id: data.session_id ?? undefined, metadata: {} });
        break;
      case "whatsapp.connection.disconnected":
        await updateConnection({ status: "disconnected", qr_status: "idle", last_disconnected_at: nowIso, metadata: {} });
        break;
      case "whatsapp.connection.error":
        await updateConnection({ status: "error", connection_error: String(data.message ?? "erro desconhecido").slice(0, 300) });
        break;
      case "whatsapp.message.received":
        await handleInboundMessage(svc, tenantId, connectionId, data);
        break;
      case "whatsapp.access.requested":
        await handleAccessRequest(svc, tenantId, connectionId, payload.conversation_id ?? null, data);
        break;
      case "whatsapp.message.sent":
      case "whatsapp.message.delivered":
      case "whatsapp.message.read":
      case "whatsapp.message.failed": {
        const status = payload.event_type.split(".").pop()!;
        if (data.provider_message_id) {
          await svc.from("messages").update({ delivery_status: status })
            .eq("zapi_message_id", data.provider_message_id);
        }
        break;
      }
      case "automation.internal_note":
        if (data.conversation_id && data.note_text) {
          await svc.from("internal_notes").insert({
            tenant_id: tenantId,
            conversation_id: data.conversation_id,
            user_id: data.user_id ?? null,
            note_text: String(data.note_text).slice(0, 4000),
          });
        }
        break;
      case "automation.pause":
        if (data.conversation_id) {
          await svc.from("conversations").update({ ai_paused: true }).eq("id", data.conversation_id).eq("tenant_id", tenantId);
        }
        break;
      case "automation.resume":
        if (data.conversation_id) {
          await svc.from("conversations").update({ ai_paused: false }).eq("id", data.conversation_id).eq("tenant_id", tenantId);
        }
        break;
      case "automation.assign":
        if (data.conversation_id && data.agent_id) {
          await svc.from("conversations").update({ assigned_agent_id: data.agent_id })
            .eq("id", data.conversation_id).eq("tenant_id", tenantId);
        }
        break;
      case "automation.transfer":
        if (data.conversation_id && data.department_id) {
          await svc.from("conversations").update({ department_id: data.department_id })
            .eq("id", data.conversation_id).eq("tenant_id", tenantId);
        }
        break;
      case "automation.reply":
        await handleAutomationReply(svc, tenantId, data);
        break;
      default:
        break;
    }

    await svc.from("inbound_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("source", "n8n").eq("external_event_id", eventId);

    return json({ ok: true });
  } catch (error) {
    console.error("n8n-webhook-receiver error:", error);
    const eventId = req.headers.get("X-Event-Id");
    if (eventId) {
      await svc.from("inbound_events").update({
        processing_status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "erro interno",
      }).eq("source", "n8n").eq("external_event_id", eventId);
    }
    return json({ error: "erro no processamento" }, 500);
  }
});

async function handleAccessRequest(
  svc: ReturnType<typeof serviceClient>,
  tenantId: string,
  connectionId: string | null,
  conversationId: string | null,
  data: Record<string, any>,
) {
  if (!connectionId || !conversationId) throw new Error("connection_id e conversation_id são obrigatórios");

  const { data: conversation } = await svc.from("conversations")
    .select("id, contact_id, whatsapp_connection_id")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!conversation?.contact_id || conversation.whatsapp_connection_id !== connectionId) {
    throw new Error("conversa ou conexão incompatível");
  }

  const { data: pending } = await svc.from("whatsapp_access_requests")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("connection_id", connectionId)
    .eq("contact_id", conversation.contact_id)
    .eq("status", "pending")
    .maybeSingle();

  const requestMessage = String(data.request_message ?? "Solicitação de acesso via WhatsApp").slice(0, 500);
  const requestedRole = data.requested_role === "viewer" ? "viewer" : "agent";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (pending) {
    await svc.from("whatsapp_access_requests").update({
      request_message: requestMessage,
      requested_role: requestedRole,
      expires_at: expiresAt,
    }).eq("id", pending.id);
    return;
  }

  await svc.from("whatsapp_access_requests").insert({
    tenant_id: tenantId,
    connection_id: connectionId,
    conversation_id: conversationId,
    contact_id: conversation.contact_id,
    requested_role: requestedRole,
    request_message: requestMessage,
    expires_at: expiresAt,
  });
}

async function handleInboundMessage(
  svc: ReturnType<typeof serviceClient>,
  tenantId: string,
  connectionId: string | null,
  data: Record<string, any>,
) {
  const chatId: string | null = data.chat_id ?? null;
  const phone = String(data.phone ?? chatId ?? "").replace(/\D/g, "");
  if (!phone) return;

  // Contact upsert
  let { data: contact } = await svc.from("contacts").select("id")
    .eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
  if (!contact) {
    const inserted = await svc.from("contacts").insert({
      tenant_id: tenantId, phone, name: data.name ?? phone,
      wa_chat_id: chatId, last_message_preview: String(data.content ?? "").slice(0, 100),
    }).select("id").single();
    contact = inserted.data;
  } else {
    await svc.from("contacts").update({
      wa_chat_id: chatId ?? undefined,
      last_message_preview: String(data.content ?? "").slice(0, 100),
    }).eq("id", contact.id);
  }
  if (!contact) return;

  // Conversation upsert
  let { data: conversation } = await svc.from("conversations").select("id, unread_count")
    .eq("tenant_id", tenantId).eq("contact_id", contact.id)
    .in("status", ["open", "waiting"]).order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (!conversation) {
    const inserted = await svc.from("conversations").insert({
      tenant_id: tenantId, contact_id: contact.id,
      whatsapp_connection_id: connectionId, status: "open",
      wa_chat_id: chatId, unread_count: 1, last_message_at: new Date().toISOString(),
    }).select("id, unread_count").single();
    conversation = inserted.data;
  } else {
    await svc.from("conversations").update({
      unread_count: (conversation.unread_count ?? 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation.id);
  }
  if (!conversation) return;

  const { data: message } = await svc.from("messages").insert({
    conversation_id: conversation.id,
    role: "contact",
    direction: "incoming",
    message_type: data.message_type ?? "text",
    content: data.content ?? null,
    media_url: data.media_url ?? null,
    media_mime_type: data.media_mime_type ?? null,
    wa_message_id: data.provider_message_id ?? null,
    zapi_message_id: data.provider_message_id ?? null,
    delivery_status: "received",
  }).select("id").single();

  // Outbox: let n8n orchestrate automation/AI (never inline in this function)
  await svc.from("event_outbox").insert({
    tenant_id: tenantId,
    event_type: "automation.requested",
    aggregate_type: "conversation",
    aggregate_id: conversation.id,
    payload: {
      event_id: crypto.randomUUID(),
      event_type: "automation.requested",
      tenant_id: tenantId,
      connection_id: connectionId,
      conversation_id: conversation.id,
      occurred_at: new Date().toISOString(),
      source: "platform",
      version: 1,
      data: { message_id: message?.id ?? null, content: data.content ?? null },
    },
  });
}

async function handleAutomationReply(
  svc: ReturnType<typeof serviceClient>,
  tenantId: string,
  data: Record<string, any>,
) {
  if (!data.conversation_id || !data.content) return;
  const { data: conversation } = await svc.from("conversations")
    .select("id, ai_mode, ai_paused").eq("id", data.conversation_id).eq("tenant_id", tenantId).maybeSingle();
  if (!conversation || conversation.ai_paused) return;

  const suggesting = data.mode === "suggest" || conversation.ai_mode === "suggesting";
  await svc.from("messages").insert({
    conversation_id: conversation.id,
    role: "ai",
    direction: "outgoing",
    message_type: "text",
    content: data.content,
    delivery_status: suggesting ? "draft" : "sent",
    wa_message_id: data.provider_message_id ?? null,
    zapi_message_id: data.provider_message_id ?? null,
  });
  if (!suggesting) {
    await svc.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
  }
}
