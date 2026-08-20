import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildEvent, corsHeaders, enqueueEvent, getIntegration, json, serviceClient } from "../_shared/n8n.ts";
import { backendCall, getBackend, humanizeBackendError } from "../_shared/whatsapp-backend.ts";

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

    // Resolve a conexão: explícita, vinculada à conversa ou a primeira da empresa.
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
      .select("id, status, provider_type, provider_instance_id, provider_session_id, provider_token")
      .eq("id", connectionId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!connection) return json({ error: "Conexão não encontrada" }, 404);

    // Permissão por conexão (ACL vazia = acesso para toda a empresa).
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

    // Respeita opt-out/bloqueio.
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

    // Modo sugestão: salva rascunho e nunca envia ao WhatsApp.
    if (body?.mode === "suggest") {
      const { data: draft, error: draftError } = await svc.from("messages").insert({
        conversation_id: conversation.id,
        role: "ai",
        direction: "outgoing",
        message_type: messageType,
        content,
        media_url: mediaUrl,
        author_id: auth.userId,
        delivery_status: "draft",
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

    const touchConversation = async () => {
      const at = new Date().toISOString();
      await svc.from("conversations").update({
        last_message_at: at,
        last_message_direction: "outgoing",
        last_agent_message_at: at,
        awaiting_reply: false,
      }).eq("id", conversation.id);
      if (contactRow?.id && content) {
        await svc.from("contacts").update({ last_message_preview: content.slice(0, 100) }).eq("id", contactRow.id);
      }
    };

    // Backend próprio: Baileys e WuzAPI são enviados DIRETAMENTE pelo backend Node.js.
    // n8n não é necessário para o atendimento básico.
    const isDirectBackend =
      connection.provider_type === "baileys_backend" ||
      connection.provider_type === "wuzapi_backend";

    if (isDirectBackend) {
      const backend = await getBackend(svc, auth.tenantId as string);
      if (!backend) return json({ error: "Backend de WhatsApp não configurado" }, 400);

      const number = chatId.replace(/\D/g, "");
      try {
        // O backend fornecido expõe POST /api/send e usa o token da própria conexão.
        // A mesma rota abstrai Baileys e WuzAPI internamente.
        const sent = await backendCall(svc, backend, "/api/send", {
          method: "POST",
          headers: connection.provider_token
            ? { Authorization: `Bearer ${connection.provider_token}` }
            : undefined,
          body: JSON.stringify({
            number,
            body: content,
            noRegister: false,
          }),
        });

        const ok = sent.status >= 200 && sent.status < 300;
        await svc.from("messages").update({
          delivery_status: ok ? "sent" : "failed",
          metadata: ok ? null : { error: `HTTP ${sent.status}` },
        }).eq("id", message.id);

        if (!ok) return json({ error: "Backend recusou o envio", details: `HTTP ${sent.status}` }, 502);
        await touchConversation();
        return json({
          success: true,
          message_id: message.id,
          delivered_via: connection.provider_type,
        });
      } catch (e) {
        const detail = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
        await svc.from("messages").update({
          delivery_status: "failed",
          metadata: { error: detail },
        }).eq("id", message.id);
        return json({ error: detail, cause: "backend_unreachable" }, 502);
      }
    }

    // Compatibilidade com conexões legadas baseadas em n8n.
    // Este bloco NÃO é usado pelas novas conexões Baileys/WuzAPI.
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
    await touchConversation();

    const integration = await getIntegration(svc, auth.tenantId);
    return json({
      success: true,
      queued: true,
      event_id: event.event_id,
      message_id: message.id,
      warning: integration ? undefined : "Conexão legada exige integração n8n configurada",
    }, 202);
  } catch (error) {
    console.error("whatsapp-send-message error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});