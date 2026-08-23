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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedToken = Deno.env.get("WHATSAPP_BACKEND_TOKEN") || "";
  const auth = req.headers.get("authorization") || "";
  if (expectedToken && auth !== `Bearer ${expectedToken}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "supabase_not_configured" }, 500);

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const sessionId = String(body?.session_id || "").trim();
    const chatId = String(body?.chat_id || "").trim();
    const waMessageId = body?.wa_message_id ? String(body.wa_message_id) : null;
    const fromMe = Boolean(body?.from_me);
    const isGroup = Boolean(body?.is_group || chatId.endsWith("@g.us"));
    const content = String(body?.content || "").slice(0, 10000);
    const rawType = String(body?.message_type || "text");
    const messageType = ["text", "audio", "image", "document", "video"].includes(rawType) ? rawType : "text";
    const timestamp = body?.timestamp ? String(body.timestamp) : new Date().toISOString();

    if (!sessionId || !chatId) return json({ error: "session_id_and_chat_id_required" }, 400);

    const { data: connection, error: connectionError } = await svc
      .from("whatsapp_connections")
      .select("id, tenant_id, provider_instance_id, provider_session_id")
      .or(`provider_instance_id.eq.${sessionId},provider_session_id.eq.${sessionId}`)
      .limit(1)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ error: "connection_not_found", session_id: sessionId }, 404);

    if (waMessageId) {
      const { data: existingMessage } = await svc
        .from("messages")
        .select("id")
        .eq("wa_message_id", waMessageId)
        .limit(1)
        .maybeSingle();
      if (existingMessage) return json({ success: true, duplicate: true, message_id: existingMessage.id });
    }

    const tenantId = connection.tenant_id;
    const phone = normalizePhone(chatId) || chatId;
    const incomingName = !fromMe ? String(body?.push_name || "").trim() : "";

    let { data: contact } = await svc
      .from("contacts")
      .select("id, name, phone, wa_chat_id, metadata")
      .eq("tenant_id", tenantId)
      .eq("wa_chat_id", chatId)
      .limit(1)
      .maybeSingle();

    if (!contact) {
      const byPhone = await svc
        .from("contacts")
        .select("id, name, phone, wa_chat_id, metadata")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      contact = byPhone.data;
    }

    if (!contact) {
      const created = await svc
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          phone,
          wa_chat_id: chatId,
          name: incomingName || (isGroup ? `Grupo ${phone}` : phone),
          last_message_preview: content.slice(0, 100),
          metadata: { source: "baileys", is_group: isGroup },
        })
        .select("id, name, phone, wa_chat_id, metadata")
        .single();
      if (created.error) throw created.error;
      contact = created.data;
    } else {
      const contactPatch: Record<string, unknown> = {
        wa_chat_id: chatId,
        last_message_preview: content.slice(0, 100),
        updated_at: new Date().toISOString(),
      };
      if (incomingName && (!contact.name || contact.name === contact.phone)) contactPatch.name = incomingName;
      await svc.from("contacts").update(contactPatch).eq("id", contact.id);
    }

    let { data: conversation } = await svc
      .from("conversations")
      .select("id, unread_count, status")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contact.id)
      .eq("whatsapp_connection_id", connection.id)
      .limit(1)
      .maybeSingle();

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
          participant: body?.participant || null,
          is_group: isGroup,
        },
        created_at: timestamp,
      })
      .select("id")
      .single();

    if (messageInsert.error) throw messageInsert.error;

    const nextUnread = fromMe ? conversation.unread_count || 0 : (conversation.unread_count || 0) + (conversation.status ? 1 : 1);
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

    await svc.from("conversations").update(conversationPatch).eq("id", conversation.id);

    return json({
      success: true,
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
