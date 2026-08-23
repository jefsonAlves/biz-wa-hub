import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, json, serviceClient } from "../_shared/n8n.ts";

const normalizePhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone);
    const name = String(body?.name ?? "").trim().slice(0, 120);
    const requestedConnectionId = body?.connection_id ? String(body.connection_id) : null;

    if (!auth.tenantId) return json({ error: "Empresa não identificada" }, 400);
    if (phone.length < 10 || phone.length > 15) {
      return json({ error: "Informe o telefone com DDI e DDD" }, 400);
    }

    const svc = serviceClient();
    let connectionQuery = svc
      .from("whatsapp_connections")
      .select("id, status, provider_type")
      .eq("tenant_id", auth.tenantId)
      .in("provider_type", ["baileys_backend", "wuzapi_backend"]);

    if (requestedConnectionId) connectionQuery = connectionQuery.eq("id", requestedConnectionId);
    else connectionQuery = connectionQuery.eq("status", "connected").order("created_at", { ascending: true });

    const { data: connection, error: connectionError } = await connectionQuery.limit(1).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return json({ error: "Nenhuma conexão WhatsApp disponível" }, 409);
    if (connection.status !== "connected") return json({ error: "A conexão WhatsApp selecionada está desconectada" }, 409);

    const chatId = `${phone}@s.whatsapp.net`;
    let { data: contact, error: contactError } = await svc
      .from("contacts")
      .select("id, name")
      .eq("tenant_id", auth.tenantId)
      .eq("phone", phone)
      .maybeSingle();
    if (contactError) throw contactError;

    if (!contact) {
      const created = await svc.from("contacts").insert({
        tenant_id: auth.tenantId,
        phone,
        name: name || phone,
        wa_chat_id: chatId,
        metadata: { source: "manual" },
      }).select("id, name").single();
      if (created.error) throw created.error;
      contact = created.data;
    } else {
      const patch: Record<string, unknown> = { wa_chat_id: chatId, updated_at: new Date().toISOString() };
      if (name && (!contact.name || contact.name === phone)) patch.name = name;
      const updated = await svc.from("contacts").update(patch).eq("id", contact.id);
      if (updated.error) throw updated.error;
    }

    let { data: conversation, error: conversationError } = await svc
      .from("conversations")
      .select("id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("contact_id", contact.id)
      .eq("whatsapp_connection_id", connection.id)
      .maybeSingle();
    if (conversationError) throw conversationError;

    if (!conversation) {
      const created = await svc.from("conversations").insert({
        tenant_id: auth.tenantId,
        contact_id: contact.id,
        whatsapp_connection_id: connection.id,
        wa_chat_id: chatId,
        status: "open",
        unread_count: 0,
        awaiting_reply: false,
      }).select("id, status").single();
      if (created.error) throw created.error;
      conversation = created.data;
    } else if (conversation.status === "archived") {
      await svc.from("conversations").update({ status: "open" }).eq("id", conversation.id);
    }

    return json({
      success: true,
      conversation_id: conversation.id,
      connection_id: connection.id,
      contact_id: contact.id,
    });
  } catch (error) {
    console.error("whatsapp-start-conversation error", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível iniciar a conversa" }, 500);
  }
});
