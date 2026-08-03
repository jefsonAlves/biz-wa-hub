import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildEvent, corsHeaders, deliverEvent, enqueueEvent, getIntegration, json, serviceClient } from "../_shared/n8n.ts";

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

    if (!conversationId) return json({ error: "conversation_id é obrigatório" }, 400);
    if (messageType === "text" && content.trim().length === 0) return json({ error: "Mensagem vazia" }, 400);
    if (content.length > 4096) return json({ error: "Mensagem muito longa" }, 400);

    const svc = serviceClient();

    const { data: conversation } = await svc
      .from("conversations")
      .select("id, tenant_id, whatsapp_connection_id, wa_chat_id, status, contacts(phone, wa_chat_id)")
      .eq("id", conversationId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

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
    if (!connectionId) return json({ error: "Nenhuma conexão de WhatsApp configurada" }, 400);

    const { data: connection } = await svc
      .from("whatsapp_connections")
      .select("id, status, provider_type, provider_instance_id, provider_session_id")
      .eq("id", connectionId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!connection) return json({ error: "Conexão não encontrada" }, 404);

    // Per-connection permission (empty ACL = tenant-wide access)
    const { data: acl } = await svc
      .from("user_connection_access")
      .select("user_id, can_reply")
      .eq("connection_id", connection.id);
    if ((acl?.length ?? 0) > 0) {
      const mine = acl!.find((a) => a.user_id === auth.userId);
      if (!mine?.can_reply) return json({ error: "Sem permissão para responder nesta conexão" }, 403);
    }

    const contact = conversation.contacts as { phone?: string; wa_chat_id?: string } | null;
    const chatId = conversation.wa_chat_id || contact?.wa_chat_id ||
      (contact?.phone ? `${contact.phone.replace(/\D/g, "")}@c.us` : null);
    if (!chatId) return json({ error: "Destinatário não identificado" }, 400);

    // Responsible operation: respect opt-out / block list on the contact tags
    const { data: contactRow } = await svc
      .from("contacts")
      .select("id, tags")
      .eq("tenant_id", auth.tenantId)
      .eq("phone", (contact?.phone ?? "").replace(/\D/g, ""))
      .maybeSingle();
    const tags: string[] = contactRow?.tags ?? [];
    if (tags.includes("opt_out") || tags.includes("blocked")) {
      return json({ error: "Contato optou por não receber mensagens" }, 403);
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

    // Display name registered by the team member — this is what the WhatsApp contact sees
    const { data: senderProfile } = await svc
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", auth.userId)
      .maybeSingle();
    const agentName = (senderProfile?.full_name?.trim() ||
      senderProfile?.email?.split("@")[0] || "").slice(0, 60);
    const outboundContent = agentName && content ? `*${agentName}*:\n${content}` : content;

    const { data: message, error: msgError } = await svc.from("messages").insert({
      conversation_id: conversation.id,
      role: "agent",
      direction: "outgoing",
      message_type: messageType,
      content,
      media_url: mediaUrl,
      author_id: auth.userId,
      delivery_status: "pending",
      metadata: { agent_name: agentName, outbound_content: outboundContent },
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
        content: outboundContent,
        raw_content: content,
        agent_name: agentName,
        message_type: messageType,
        media_url: mediaUrl,
        provider_instance_id: connection.provider_instance_id,
        provider_session_id: connection.provider_session_id,
        sent_by: auth.userId,

      },
    });

    await enqueueEvent(svc, event, { type: "message", id: message.id });

    await svc.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
    if (contactRow?.id && content) {
      await svc.from("contacts").update({ last_message_preview: content.slice(0, 100) }).eq("id", contactRow.id);
    }

    const integration = await getIntegration(svc, auth.tenantId);
    if (!integration) {
      return json({ success: true, queued: true, message_id: message.id, warning: "Integração n8n não configurada" });
    }

    const result = await deliverEvent(svc, event, integration);
    await svc.from("event_outbox").update(
      result.success
        ? { status: "sent", attempts: 1, processed_at: new Date().toISOString() }
        : { status: "pending", attempts: 1, last_error: result.error, next_retry_at: new Date(Date.now() + 30000).toISOString() },
    ).eq("id", event.event_id);

    await svc.from("messages")
      .update({ delivery_status: result.success ? "queued" : "pending" })
      .eq("id", message.id);

    return json({ success: true, message_id: message.id, dispatched: result.success, error: result.error });
  } catch (error) {
    console.error("whatsapp-send-message error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});
