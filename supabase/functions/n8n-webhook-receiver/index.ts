import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, hmacSha256Hex, json, serviceClient, sha256Hex,
  signaturePayload, timingSafeEqual, webhookSecret,
} from "../_shared/n8n.ts";

const INBOUND_TYPES = new Set([
  "whatsapp.connection.creating",
  "whatsapp.connection.qr.generated",
  "whatsapp.connection.connected",
  "whatsapp.connection.disconnected",
  "whatsapp.connection.error",
  "whatsapp.connection.qr.failed",
  "whatsapp.sync.batch",
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
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function contactDisplayName(name: unknown, phone: string, chatId?: string | null) {
  const candidate = firstText(name);
  if (candidate && candidate !== phone && candidate.replace(/\D/g, "") !== phone) {
    return candidate.slice(0, 200);
  }

  const suffix = phone.length > 4 ? phone.slice(-4) : phone;
  if (chatId?.endsWith("@g.us")) return `Grupo WhatsApp ${suffix}`;
  return `Cliente WhatsApp ${suffix}`;
}

function extractQrCode(data: Record<string, any>) {
  return firstText(
    data.qr_code,
    data.qrcode,
    data.base64,
    data.code,
    data.qr,
    data.qrcode?.base64,
    data.qrcode?.code,
    data.data?.qr_code,
    data.data?.qrcode,
    data.data?.base64,
    data.data?.code,
  );
}

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

    let { data: integration } = await svc
      .from("n8n_integrations")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!integration) {
      const { data: globalIntegration } = await svc
        .from("n8n_integrations")
        .select("id, status")
        .is("tenant_id", null)
        .maybeSingle();
      integration = globalIntegration;
    }
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
      case "whatsapp.connection.qr.generated": {
        const qrCode = extractQrCode(data);
        if (!qrCode) {
          await updateConnection({
            status: "error",
            qr_status: "failed",
            connection_error: "qr_code_empty",
          });
          break;
        }
        await updateConnection({ qr_status: "available", status: "qr_pending", connection_error: null,
          metadata: { qr_code: qrCode, qr_expires_at: data.expires_at ?? null } });
        break;
      }
      case "whatsapp.connection.connected":
        await updateConnection({ status: "connected", qr_status: "idle", connection_error: null,
          last_connected_at: nowIso, phone_number: data.phone_number ?? undefined,
          provider_session_id: data.session_id ?? undefined, metadata: {} });
        break;
      case "whatsapp.connection.disconnected":
        await updateConnection({ status: "disconnected", qr_status: "idle", last_disconnected_at: nowIso, metadata: {} });
        break;
      case "whatsapp.connection.error":
      case "whatsapp.connection.qr.failed":
        await updateConnection({
          status: "error",
          ...(payload.event_type === "whatsapp.connection.qr.failed" ? { qr_status: "failed" } : {}),
          connection_error: String(data.message ?? data.error ?? "erro desconhecido").slice(0, 300),
        });
        break;
      case "whatsapp.message.received":
        await handleInboundMessage(svc, tenantId, connectionId, data);
        break;
      case "whatsapp.sync.batch":
        await handleSyncBatch(svc, tenantId, connectionId, data);
        break;
      case "whatsapp.access.requested":
        await handleAccessRequest(svc, tenantId, connectionId, payload.conversation_id ?? null, data);
        break;
      case "whatsapp.message.sent":
        if (data.chat_id || data.phone || data.content || data.media_url) {
          await handleInboundMessage(svc, tenantId, connectionId, {
            ...data,
            from_me: true,
            direction: "outgoing",
          }, { enqueueAutomation: false, incrementUnread: false });
        }
        if (data.provider_message_id) {
          await svc.from("messages").update({ delivery_status: "sent" })
            .eq("zapi_message_id", data.provider_message_id);
        }
        break;
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
    const detail = error instanceof Error ? error.message : String(error);
    console.error("n8n-webhook-receiver error:", detail);
    const eventId = req.headers.get("X-Event-Id");
    if (eventId) {
      await svc.from("inbound_events").update({
        processing_status: "failed",
        error_message: detail.slice(0, 500),
      }).eq("source", "n8n").eq("external_event_id", eventId);
    }
    return json({
      error: "erro no processamento",
      detail: detail.slice(0, 300),
    }, 500);
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
  options: { enqueueAutomation?: boolean; incrementUnread?: boolean } = {},
) {
  const chatId: string | null = data.chat_id ?? null;
  const phone = String(data.phone ?? chatId ?? "").replace(/\D/g, "");
  if (!phone) return;

  const providerMessageId = data.provider_message_id
    ? String(data.provider_message_id)
    : null;
  if (providerMessageId) {
    const { data: existingMessage } = await svc.from("messages")
      .select("id")
      .eq("wa_message_id", providerMessageId)
      .maybeSingle();
    if (existingMessage) return;
  }

  const occurredAtCandidate = data.occurred_at
    ? new Date(String(data.occurred_at))
    : new Date();
  const messageOccurredAt = Number.isNaN(occurredAtCandidate.getTime())
    ? new Date().toISOString()
    : occurredAtCandidate.toISOString();
  const isOutgoing = data.from_me === true || data.direction === "outgoing";
  const incrementUnread = options.incrementUnread ?? true;

  let storedMediaPath: string | null = null;
  const encodedMedia = typeof data.media_base64 === "string"
    ? data.media_base64.replace(/^data:[^;]+;base64,/, "")
    : null;
  if (encodedMedia) {
    const mimeType = String(data.media_mime_type ?? "application/octet-stream").toLowerCase();
    const allowedMime = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|webm)|video\/(mp4|webm)|application\/(pdf|octet-stream))$/;
    if (!allowedMime.test(mimeType)) throw new Error("media_mime_type_not_allowed");
    const binary = Uint8Array.from(atob(encodedMedia), (character) => character.charCodeAt(0));
    if (binary.byteLength > MAX_MEDIA_BYTES) throw new Error("media_too_large");
    const extensionByMime: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm",
      "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf",
    };
    const extension = extensionByMime[mimeType] ?? "bin";
    storedMediaPath = `${tenantId}/whatsapp/${providerMessageId ?? crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await svc.storage.from("media").upload(storedMediaPath, binary, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploadError) throw uploadError;
  }

  // Contact upsert
  let { data: contact } = await svc.from("contacts").select("id, name")
    .eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
  const existingName = typeof contact?.name === "string" ? contact.name : null;
  const displayName = firstText(data.name)
    ? contactDisplayName(data.name, phone, chatId)
    : (existingName || contactDisplayName(data.name, phone, chatId));
  if (!contact) {
    const inserted = await svc.from("contacts").insert({
      tenant_id: tenantId, phone, name: displayName,
      wa_chat_id: chatId, last_message_preview: String(data.content ?? "").slice(0, 100),
    }).select("id").single();
    contact = inserted.data;
  } else {
    await svc.from("contacts").update({
      name: displayName,
      wa_chat_id: chatId ?? undefined,
      last_message_preview: String(data.content ?? "").slice(0, 100),
    }).eq("id", contact.id);
  }
  if (!contact) return;

  // Conversation upsert
  let { data: conversation } = await svc.from("conversations").select("id, unread_count, last_message_at")
    .eq("tenant_id", tenantId).eq("contact_id", contact.id)
    .in("status", ["open", "waiting"]).order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (!conversation) {
    const inserted = await svc.from("conversations").insert({
      tenant_id: tenantId, contact_id: contact.id,
      whatsapp_connection_id: connectionId, status: "open",
      wa_chat_id: chatId, unread_count: !incrementUnread || isOutgoing ? 0 : 1,
      last_message_at: messageOccurredAt,
      last_message_direction: isOutgoing ? "outgoing" : "incoming",
      awaiting_reply: !isOutgoing,
      last_customer_message_at: isOutgoing ? null : messageOccurredAt,
      last_agent_message_at: isOutgoing ? messageOccurredAt : null,
    }).select("id, unread_count, last_message_at").single();
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    conversation = inserted.data;

    // Another message for the same contact may have created the active
    // conversation concurrently. The database constraint elects one winner;
    // all other messages must reuse it instead of creating duplicate threads.
    if (!conversation) {
      const existing = await svc.from("conversations").select("id, unread_count, last_message_at")
        .eq("tenant_id", tenantId).eq("contact_id", contact.id)
        .in("status", ["open", "waiting"])
        .order("last_message_at", { ascending: false })
        .limit(1).single();
      if (existing.error) throw existing.error;
      conversation = existing.data;
    }
  } else {
    const previousLastMessageAt = conversation.last_message_at
      ? new Date(conversation.last_message_at).getTime()
      : 0;
    const incomingMessageTime = new Date(messageOccurredAt).getTime();
    const isNewestMessage = incomingMessageTime >= previousLastMessageAt;
    await svc.from("conversations").update({
      unread_count: !incrementUnread || isOutgoing
        ? (conversation.unread_count ?? 0)
        : (conversation.unread_count ?? 0) + 1,
      ...(isNewestMessage ? {
        last_message_at: messageOccurredAt,
        last_message_direction: isOutgoing ? "outgoing" : "incoming",
        awaiting_reply: !isOutgoing,
      } : {}),
      ...(isOutgoing
        ? { last_agent_message_at: messageOccurredAt }
        : { last_customer_message_at: messageOccurredAt }),
    }).eq("id", conversation.id);
  }
  if (!conversation) return;

  const { data: message } = await svc.from("messages").insert({
    conversation_id: conversation.id,
    role: isOutgoing ? "agent" : "contact",
    direction: isOutgoing ? "outgoing" : "incoming",
    message_type: data.message_type ?? "text",
    content: data.content ?? null,
    media_url: storedMediaPath ?? data.media_url ?? null,
    media_mime_type: data.media_mime_type ?? null,
    wa_message_id: providerMessageId,
    zapi_message_id: providerMessageId,
    delivery_status: isOutgoing ? "sent" : "received",
    created_at: messageOccurredAt,
  }).select("id").single();

  if (options.enqueueAutomation === false) return;

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

async function handleSyncBatch(
  svc: ReturnType<typeof serviceClient>,
  tenantId: string,
  connectionId: string | null,
  data: Record<string, any>,
) {
  const contacts = Array.isArray(data.contacts) ? data.contacts.slice(0, 500) : [];
  const messages = Array.isArray(data.messages) ? data.messages.slice(0, 500) : [];

  const contactRows = contacts
    .map((contact: Record<string, any>) => {
      const chatId = String(contact.chat_id ?? "");
      const phone = String(contact.phone ?? chatId).replace(/\D/g, "");
      if (!phone) return null;
      return {
        tenant_id: tenantId,
        phone,
        name: contactDisplayName(contact.name, phone, chatId),
        wa_chat_id: chatId || null,
        avatar_url: contact.avatar_url ?? null,
        last_message_preview: String(contact.last_message_preview ?? "").slice(0, 100),
      };
    })
    .filter(Boolean);

  if (contactRows.length) {
    const { error } = await svc.from("contacts").upsert(contactRows, {
      onConflict: "phone,tenant_id",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  // Messages from the same chat remain sequential; independent chats use a
  // small worker pool so large sync batches do not exceed the Edge timeout.
  messages.sort((left: Record<string, any>, right: Record<string, any>) => {
    const leftTime = new Date(String(left.occurred_at ?? 0)).getTime() || 0;
    const rightTime = new Date(String(right.occurred_at ?? 0)).getTime() || 0;
    return leftTime - rightTime;
  });
  const groups = new Map<string, Record<string, any>[]>();
  for (const message of messages) {
    const key = String(message.chat_id ?? message.phone ?? "unknown");
    const group = groups.get(key) ?? [];
    group.push(message);
    groups.set(key, group);
  }
  const pendingGroups = Array.from(groups.values());
  const workers = Array.from({ length: Math.min(6, pendingGroups.length) }, async () => {
    while (pendingGroups.length) {
      const group = pendingGroups.shift();
      if (!group) return;
      for (const message of group) {
        await handleInboundMessage(svc, tenantId, connectionId, message, {
          enqueueAutomation: false,
          incrementUnread: message.is_unread === true || message.unread === true,
        });
      }
    }
  });
  await Promise.all(workers);

  if (connectionId) {
    await svc.from("whatsapp_connections").update({
      last_health_check_at: new Date().toISOString(),
      connection_error: null,
    }).eq("id", connectionId).eq("tenant_id", tenantId);
  }
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
    const nowIso = new Date().toISOString();
    await svc.from("conversations").update({
      last_message_at: nowIso,
      last_message_direction: "outgoing",
      last_agent_message_at: nowIso,
      awaiting_reply: false,
    }).eq("id", conversation.id);
  }
}
