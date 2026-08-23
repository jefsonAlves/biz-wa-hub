import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizePhone = (chatId: string) => chatId.split("@")[0].replace(/\D/g, "");
const isBroadcast = (chatId: string) => chatId === "status@broadcast" || chatId.endsWith("@broadcast");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedToken = Deno.env.get("WHATSAPP_BACKEND_TOKEN") || "";
  const auth = req.headers.get("authorization") || "";
  if (expectedToken && auth !== `Bearer ${expectedToken}`) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "supabase_not_configured" }, 500);

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const event = String(body?.event || "message.upsert");
    const sessionId = String(body?.session_id || "").trim();
    const chatId = String(body?.chat_id || "").trim();
    const rawChatId = String(body?.raw_chat_id || chatId).trim();

    if (!sessionId || !chatId) return json({ error: "session_id_and_chat_id_required" }, 400);
    if (isBroadcast(chatId)) return json({ success: true, ignored: true, reason: "broadcast" });

    const { data: connection, error: connectionError } = await svc
      .from("whatsapp_connections")
      .select("id, tenant_id, provider_instance_id, provider_session_id")
      .or(`provider_instance_id.eq.${sessionId},provider_session_id.eq.${sessionId}`)
      .limit(1)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ error: "connection_not_found", session_id: sessionId }, 404);

    const tenantId = connection.tenant_id;
    const isGroup = Boolean(body?.is_group || chatId.endsWith("@g.us") || rawChatId.endsWith("@g.us"));
    const phoneJid = String(body?.phone_jid || "").trim();
    const phone = normalizePhone(phoneJid || chatId) || normalizePhone(rawChatId) || chatId;

    const findContact = async () => {
      let { data: contact } = await svc
        .from("contacts")
        .select("id, name, phone, wa_chat_id, metadata")
        .eq("tenant_id", tenantId)
        .eq("wa_chat_id", chatId)
        .limit(1)
        .maybeSingle();

      if (!contact && rawChatId && rawChatId !== chatId) {
        const byRaw = await svc
          .from("contacts")
          .select("id, name, phone, wa_chat_id, metadata")
          .eq("tenant_id", tenantId)
          .eq("wa_chat_id", rawChatId)
          .limit(1)
          .maybeSingle();
        contact = byRaw.data;
      }

      if (!contact && phone) {
        const byPhone = await svc
          .from("contacts")
          .select("id, name, phone, wa_chat_id, metadata")
          .eq("tenant_id", tenantId)
          .eq("phone", phone)
          .limit(1)
          .maybeSingle();
        contact = byPhone.data;
      }

      return contact;
    };

    if (event === "contact.upsert" || event === "contact.update" || event === "chat.upsert") {
      const contactName = String(body?.name || body?.notify || "").trim();
      const existing = await findContact();
      const metadata = {
        ...(existing?.metadata ?? {}),
        source: "baileys",
        source_kind: body?.source || event,
        is_group: isGroup,
        raw_chat_id: rawChatId,
        lid: body?.lid || null,
        phone_jid: phoneJid || (chatId.endsWith("@s.whatsapp.net") ? chatId : null),
        notify: body?.notify || null,
        username: body?.username || null,
        synced_from_whatsapp: true,
      };

      if (!existing) {
        const created = await svc
          .from("contacts")
          .insert({
            tenant_id: tenantId,
            phone,
            wa_chat_id: chatId,
            name: contactName || (isGroup ? `Grupo ${phone}` : phone),
            last_message_preview: null,
            metadata,
          })
          .select("id, name, phone, wa_chat_id, metadata")
          .single();
        if (created.error) throw created.error;
        return json({ success: true, event, contact_id: created.data.id, created: true });
      }

      const contactPatch: Record<string, unknown> = {
        phone,
        wa_chat_id: chatId,
        metadata,
        updated_at: new Date().toISOString(),
      };
      if (contactName && (!existing.name || existing.name === existing.phone || existing.name.startsWith("Grupo "))) {
        contactPatch.name = contactName;
      }

      const updated = await svc.from("contacts").update(contactPatch).eq("id", existing.id);
      if (updated.error) throw updated.error;
      return json({ success: true, event, contact_id: existing.id, created: false });
    }

    const waMessageId = body?.wa_message_id ? String(body.wa_message_id) : null;
    const fromMe = Boolean(body?.from_me);
    const content = String(body?.content || "").slice(0, 10000);
    const rawType = String(body?.message_type || "text");
    const messageType = ["text", "audio", "image", "document", "video"].includes(rawType) ? rawType : "text";
    const timestamp = body?.timestamp ? String(body.timestamp) : new Date().toISOString();

    if (waMessageId) {
      const { data: existingMessage } = await svc
        .from("messages")
        .select("id")
        .eq("wa_message_id", waMessageId)
        .limit(1)
        .maybeSingle();
      if (existingMessage) return json({ success: true, duplicate: true, message_id: existingMessage.id });
    }

    const incomingName = !fromMe ? String(body?.push_name || "").trim() : "";
    let contact = await findContact();

    if (!contact) {
      const created = await svc
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          phone,
          wa_chat_id: chatId,
          name: incomingName || (isGroup ? `Grupo ${phone}` : phone),
          last_message_preview: content.slice(0, 100),
          metadata: {
            source: "baileys",
            source_kind: body?.source || "live",
            is_group: isGroup,
            raw_chat_id: rawChatId,
            synced_from_whatsapp: true,
          },
        })
        .select("id, name, phone, wa_chat_id, metadata")
        .single();
      if (created.error) throw created.error;
      contact = created.data;
    } else {
      const contactPatch: Record<string, unknown> = {
        wa_chat_id: chatId,
        phone,
        last_message_preview: content.slice(0, 100),
        metadata: {
          ...(contact.metadata ?? {}),
          source: "baileys",
          source_kind: body?.source || "live",
          is_group: isGroup,
          raw_chat_id: rawChatId,
          synced_from_whatsapp: true,
        },
        updated_at: new Date().toISOString(),
      };
      if (incomingName && (!contact.name || contact.name === contact.phone)) contactPatch.name = incomingName;
      const updated = await svc.from("contacts").update(contactPatch).eq("id", contact.id);
      if (updated.error) throw updated.error;
    }

    let { data: conversation } = await svc
      .from("conversations")
      .select("id, unread_count, status")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contact.id)
      .eq("whatsapp_connection_id", connection.id)
      .limit(1)
      .maybeSingle();

    let conversationCreated = false;
    if (!conversation) {
      const created = await svc
        .from("conversations")
        .insert({
          tenant_id: tenantId,
          contact_id: contact.id,
          whatsapp_connection_id: connection.id,
          wa_chat_id: chatId,
          status: "open",
          unread_count: fromMe ? 0 : 1,
          last_message_at: timestamp,
          last_message_direction: fromMe ? "outgoing" : "incoming",
          awaiting_reply: !fromMe,
          ...(fromMe ? { last_agent_message_at: timestamp } : { last_contact_message_at: timestamp }),
        })
        .select("id, unread_count, status")
        .single();
      if (created.error) throw created.error;
      conversation = created.data;
      conversationCreated = true;
    }

    const messageInsert = await svc
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        role: fromMe ? "agent" : "contact",
        direction: fromMe ? "outgoing" : "incoming",
        message_type: messageType,
        content,
        delivery_status: fromMe ? "sent" : "received",
        wa_message_id: waMessageId,
        media_mime_type: body?.mime_type || null,
        metadata: {
          source: "baileys",
          source_kind: body?.source || "live",
          chat_id: chatId,
          raw_chat_id: rawChatId,
          participant: body?.participant || null,
          participant_pn: body?.participant_pn || null,
          is_group: isGroup,
        },
        created_at: timestamp,
      })
      .select("id")
      .single();

    if (messageInsert.error) throw messageInsert.error;

    const currentUnread = conversation.unread_count || 0;
    const nextUnread = fromMe ? currentUnread : conversationCreated ? currentUnread : currentUnread + 1;
    const conversationPatch: Record<string, unknown> = {
      last_message_at: timestamp,
      last_message_direction: fromMe ? "outgoing" : "incoming",
      awaiting_reply: !fromMe,
      wa_chat_id: chatId,
      unread_count: nextUnread,
      updated_at: new Date().toISOString(),
      ...(fromMe ? { last_agent_message_at: timestamp } : { last_contact_message_at: timestamp }),
    };
    if (!fromMe && conversation.status === "archived") conversationPatch.status = "open";

    const conversationUpdate = await svc.from("conversations").update(conversationPatch).eq("id", conversation.id);
    if (conversationUpdate.error) throw conversationUpdate.error;

    return json({
      success: true,
      event,
      tenant_id: tenantId,
      connection_id: connection.id,
      contact_id: contact.id,
      conversation_id: conversation.id,
      message_id: messageInsert.data.id,
    });
  } catch (error) {
    console.error("whatsapp-baileys-webhook error", error);
    return json({
      error: "message_ingest_failed",
      message: error instanceof Error ? error.message : "erro desconhecido",
    }, 500);
  }
});
