import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    console.log("GREEN-API webhook received:", JSON.stringify(payload).slice(0, 500));

    const typeWebhook = payload.typeWebhook;
    const instanceId = payload.instanceData?.idInstance?.toString();

    if (!instanceId) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("zapi_instance_id", instanceId)
      .limit(1)
      .maybeSingle();

    if (!connection) {
      console.log("No connection found for instanceId:", instanceId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const tenantId = connection.tenant_id;

    // Handle state change
    if (typeWebhook === "stateInstanceChanged") {
      const state = payload.stateInstance;
      if (state === "authorized") {
        await supabase.from("whatsapp_connections").update({
          status: "connected", last_connected_at: new Date().toISOString(),
        }).eq("id", connection.id);
      } else if (state === "notAuthorized" || state === "blocked") {
        await supabase.from("whatsapp_connections").update({ status: "disconnected" }).eq("id", connection.id);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Handle outgoing message status updates
    if (typeWebhook === "outgoingMessageStatus") {
      const messageId = payload.idMessage;
      const status = payload.status; // sent, delivered, read, failed
      if (messageId && status) {
        await supabase.from("messages")
          .update({ delivery_status: status })
          .eq("wa_message_id", messageId);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Only process incoming messages
    if (typeWebhook !== "incomingMessageReceived") {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const messageData = payload.messageData;
    const senderData = payload.senderData;

    const chatId = senderData?.chatId || "";
    const phone = chatId.replace("@c.us", "").replace("@g.us", "").replace(/\D/g, "");

    if (!phone) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const senderName = senderData?.senderName || null;
    const messageId = payload.idMessage || null;

    // Check duplicate
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from("messages").select("id").eq("wa_message_id", messageId).maybeSingle();
      if (existingMsg) {
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }

    let messageContent = "";
    let messageType = "text";
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;

    const msgType = messageData?.typeMessage;
    if (msgType === "textMessage") {
      messageContent = messageData.textMessageData?.textMessage || "";
    } else if (msgType === "extendedTextMessage") {
      messageContent = messageData.extendedTextMessageData?.text || "";
    } else if (msgType === "imageMessage") {
      messageType = "image";
      messageContent = messageData.imageMessage?.caption || "";
      const downloadUrl = messageData.imageMessage?.downloadUrl;
      mediaMime = messageData.imageMessage?.mimeType || "image/jpeg";
      if (downloadUrl) {
        try {
          const resp = await fetch(downloadUrl);
          const blob = await resp.blob();
          const ext = mediaMime?.split("/")?.[1] || "jpg";
          const path = `${tenantId}/messages/${Date.now()}.${ext}`;
          await supabase.storage.from("media").upload(path, blob, { contentType: mediaMime || undefined });
          const { data: pubUrl } = supabase.storage.from("media").getPublicUrl(path);
          mediaUrl = pubUrl.publicUrl;
        } catch (e) { console.error("Media error:", e); }
      }
    } else if (msgType === "documentMessage") {
      messageType = "document";
      messageContent = messageData.documentMessage?.caption || messageData.documentMessage?.title || "";
    } else if (msgType === "audioMessage") {
      messageType = "audio";
    } else if (msgType === "videoMessage") {
      messageType = "video";
      messageContent = messageData.videoMessage?.caption || "";
    } else if (msgType === "stickerMessage") {
      messageType = "sticker";
    } else if (msgType === "locationMessage") {
      messageType = "location";
      const loc = messageData.locationMessageData;
      messageContent = loc ? `📍 ${loc.latitude}, ${loc.longitude}` : "";
    }

    // Upsert contact
    let contactId: string;
    const { data: existingContact } = await supabase
      .from("contacts").select("id").eq("phone", phone).eq("tenant_id", tenantId).maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      await supabase.from("contacts").update({
        name: senderName || undefined,
        wa_chat_id: chatId,
        last_message_preview: messageContent?.slice(0, 100) || null,
      }).eq("id", contactId);
    } else {
      const { data: newContact } = await supabase.from("contacts").insert({
        phone, tenant_id: tenantId, name: senderName, wa_chat_id: chatId,
        last_message_preview: messageContent?.slice(0, 100) || null,
      }).select().single();
      if (!newContact) return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      contactId = newContact.id;
    }

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from("conversations").select("*")
      .eq("tenant_id", tenantId).eq("contact_id", contactId)
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    let conversationId: string;
    let conv: any;
    if (existingConv) {
      conversationId = existingConv.id;
      conv = existingConv;
      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        unread_count: (existingConv.unread_count || 0) + 1,
      }).eq("id", conversationId);
    } else {
      const { data: newConv } = await supabase.from("conversations").insert({
        tenant_id: tenantId, contact_id: contactId, whatsapp_connection_id: connection.id,
        wa_chat_id: chatId, status: "open",
        last_message_at: new Date().toISOString(), unread_count: 1,
      }).select().single();
      conversationId = newConv!.id;
      conv = newConv;
    }

    // Insert message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: messageContent || null,
      role: "contact",
      direction: "incoming",
      message_type: messageType,
      media_url: mediaUrl,
      media_mime_type: mediaMime,
      wa_message_id: messageId,
      zapi_message_id: messageId,
      delivery_status: "received",
    });

    console.log("Message stored for conversation:", conversationId);

    // AI Auto-Response - only if ai_mode is 'auto' and not paused
    const aiMode = conv?.ai_mode || "auto";
    const aiPaused = conv?.ai_paused || false;

    if (!aiPaused && aiMode === "auto" && messageContent && messageType === "text") {
      try {
        // Check if knowledge base has indexed items - skip AI if empty
        const { count: knowledgeCount } = await supabase
          .from("knowledge_items")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "indexed");

        if (!knowledgeCount || knowledgeCount === 0) {
          console.log("No knowledge base items - skipping AI response for tenant:", tenantId);
        } else {
        const { data: agentConfig } = await supabase
          .from("agents_config").select("*")
          .eq("tenant_id", tenantId).eq("is_active", true)
          .limit(1).maybeSingle();

        const { data: history } = await supabase
          .from("messages").select("role, content")
          .eq("conversation_id", conversationId).eq("is_internal", false)
          .order("created_at", { ascending: true }).limit(20);

        const { data: knowledgeItems } = await supabase
          .from("knowledge_items").select("content, title")
          .eq("tenant_id", tenantId).eq("status", "indexed").limit(5);

        const knowledgeContext = knowledgeItems?.map(k => `[${k.title}]: ${k.content}`).join("\n\n") || "";
        const systemPrompt = agentConfig?.system_prompt ||
          "Você é um assistente de atendimento via WhatsApp. Seja educado, conciso e útil. Responda em português.";
        const persona = agentConfig?.persona || "Assistente virtual amigável";
        const model = agentConfig?.model || "google/gemini-3-flash-preview";
        const temperature = agentConfig?.temperature ?? 0.7;
        const blockedKeywords = agentConfig?.blocked_keywords || [];

        const hasBlockedKeyword = blockedKeywords.some((kw: string) =>
          messageContent.toLowerCase().includes(kw.toLowerCase()));

        if (!hasBlockedKeyword) {
          const aiMessages: Array<{role: string; content: string}> = [
            { role: "system", content: `${systemPrompt}\n\nSua persona: ${persona}\n\n${knowledgeContext ? `Base de conhecimento:\n${knowledgeContext}\n\n` : ""}Regras:\n- Responda de forma concisa e direta, ideal para WhatsApp\n- Use no máximo 2-3 parágrafos curtos\n- Não use markdown formatado\n- Se não souber, diga que vai encaminhar para um atendente` },
          ];

          if (history) {
            for (const msg of history) {
              aiMessages.push({ role: msg.role === "contact" ? "user" : "assistant", content: msg.content || "" });
            }
          }

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model, messages: aiMessages, temperature, max_tokens: 500 }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const aiReply = aiData.choices?.[0]?.message?.content;

              if (aiReply) {
                // suggest mode: save as draft
                if (aiMode === "suggest") {
                  await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    content: aiReply, role: "ai",
                    direction: "outgoing", message_type: "text",
                    delivery_status: "draft",
                  });
                } else {
                  // auto mode: save and send
                  const { data: aiMsg } = await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    content: aiReply, role: "ai",
                    direction: "outgoing", message_type: "text",
                    delivery_status: "queued",
                  }).select().single();

                  const apiUrl = connection.api_url || "https://api.green-api.com";
                  const sendUrl = `${apiUrl}/waInstance${connection.zapi_instance_id}/sendMessage/${connection.zapi_token}`;
                  const sendResp = await fetch(sendUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatId: `${phone}@c.us`, message: aiReply }),
                  });
                  const sendData = await sendResp.json();

                  if (sendData.idMessage && aiMsg) {
                    await supabase.from("messages").update({
                      wa_message_id: sendData.idMessage,
                      zapi_message_id: sendData.idMessage,
                      delivery_status: "sent",
                    }).eq("id", aiMsg.id);
                  }
                }
              }
            }
          }
        }
        } // end knowledgeCount > 0
      } catch (aiError) {
        console.error("AI auto-response error:", aiError);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
