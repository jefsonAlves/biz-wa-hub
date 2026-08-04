import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildEvent, corsHeaders, enqueueEvent, getIntegration, json, serviceClient } from "../_shared/n8n.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => null);
    const conversationId = body?.conversation_id as string | undefined;
    const content = typeof body?.content === "string" ? body.content : "";
    const messageType = (body?.message_type as string) || "text";
    const mediaUrl = (body?.media_url as string) || null;

    if (!conversationId) return json({ error: "conversation_id Ã© obrigatÃ³rio" }, 400);
    if (messageType === "text" && content.trim().length === 0) return json({ error: "Mensagem vazia" }, 400);
    if (content.length > 4096) return json({ error: "Mensagem muito longa" }, 400);

    const svc = serviceClient();

    const { data: conversation } = await svc
      .from("conversations")
      .select("id, tenant_id, whatsapp_connection_id, wa_chat_id, status, contacts(phone, wa_chat_id)")
      .eq("id", conversationId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa nÃ£o encontrada" }, 404);

    // Resolve connection: explicit, conversation's, or the tenant's first connected one
    let connectionId = (body?.connection_id as string | undefined) ?? conversation.whatsapp_connection_id ?? null;
    if (!connectionId) {
      const { data: fallback } = await svc
        .from("whatsapp_connections")
        .select("id")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      connectionId = fallback?.id ?? null;
    }
    if (!connectionId) return json({ error: "Nenhuma conexÃ£o de WhatsApp configurada" }, 400);

    const { data: connection } = await svc
      .from("whatsapp_connections")
      .select("id, status, provider_type, provider_instance_id, provider_session_id")
      .eq("id", connectionId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!connection) return json({ error: "ConexÃ£o nÃ£o encontrada" }, 404);

    // Per-connection permission (empty ACL = tenant-wide access)
    const { data: acl } = await svc
      .from("user_connection_access")
      .select("user_id, can_reply")
      .eq("connection_id", connection.id);
    if ((acl?.length ?? 0) > 0) {
      const mine = acl!.find((a) => a.user_id === auth.userId);
      if (!mine?.can_reply) return json({ error: "Sem permissÃ£o para responder nesta conexÃ£o" }, 403);
    }

    const contact = conversation.contacts as { phone?: string; wa_chat_id?: string } | null;
    const chatId = conversation.wa_chat_id || contact?.wa_chat_id ||
      (contact?.phone ? `${contact.phone.replace(/\D/g, "")}@c.us` : null);
    if (!chatId) return json({ error: "DestinatÃ¡rio nÃ£o identificado" }, 400);

    // Responsible operation: respect opt-out / block list on the contact tags
    const { data: contactRow } = await svc
      .from("contacts")
      .select("id, tags")
      .eq("tenant_id", auth.tenantId)
      .eq("phone", (contact?.phone ?? "").replace(/\D/g, ""))
      .maybeSingle();
    const tags: string[] = contactRow?.tags ?? [];
    if (tags.includes("opt_out") || tags.includes("blocked")) {
      return json({ error: "Contato optou por nÃ£o receber mensagens" }, 403);
    }

    // Suggestion mode: store as draft, never dispatch
    if (body?.mode === "suggest") {
      const { data: draft, error: draftError } = await svc.from("messages").insert({
        conversation_id: conversation.id,
        role: "ai", direction: "outgoing", message_type: messageType,
        content, media_url: mediaUrl, author_id: auth.userId, delivery_status: "draft",
      }).select("id").single();
      if (draftError) throw draftError;
      return json({ success: true, message_id: draft.id, mode: "suggest" });
    }

    const { data: message, error: msgError } = await svc.from("messages").insert({
      conversation_id: conversation.id,
      role: "agent",
      direction: "outgoing",
      message_type: messageType,
      content,
      media_url: mediaUrl,
      author_id: auth.userId,
      delivery_status: "pending",
    }).select("id").single();
    if (msgError) throw msgError;

    const event = buildEvent({
      event_type: mediaUrl ? "whatsapp.media.send" : "whatsapp.message.send",
      tenant_id: auth.tenantId,
      connection_id: connection.id,
      conversation_id: conversation.id,
      data: {
        message_id: message.id,
        chat_id: chatId,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        provider_instance_id: connection.provider_instance_id,
        provider_session_id: connection.provider_session_id,
        sent_by: auth.userId,
      },
    });

    await enqueueEvent(svc, event, { type: "message", id: message.id });

    const queuedAt = new Date().toISOString();
    await svc.from("conversations").update({
      last_message_at: queuedAt,
      last_message_direction: "outgoing",
      last_agent_message_at: queuedAt,
      awaiting_reply: false,
    }).eq("id", conversation.id);
    if (contactRow?.id && content) {
      await svc.from("contacts").update({ last_message_preview: content.slice(0, 100) }).eq("id", contactRow.id);
    }

    const integration = await getIntegration(svc, auth.tenantId);
    return json({
      success: true,
      queued: true,
      event_id: event.event_id,
      message_id: message.id,
      warning: integration ? undefined : "IntegraÃ§Ã£o n8n nÃ£o configurada",
    }, 202);
  } catch (error) {
    console.error("whatsapp-send-message error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});

