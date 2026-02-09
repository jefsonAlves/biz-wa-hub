import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    console.log("Webhook received payload:", JSON.stringify(payload).slice(0, 500));

    const instanceId = payload.instanceId || payload.phone?.split("@")?.[0];
    if (!instanceId) {
      console.log("No instanceId in payload");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Find tenant by instance ID
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

    // Normalize phone
    const rawPhone = payload.phone?.split("@")?.[0] || payload.chatId?.split("@")?.[0] || "";
    const phone = rawPhone.replace(/\D/g, "");
    if (!phone) {
      console.log("No phone in payload");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const isFromMe = payload.fromMe === true;
    const messageContent = payload.text?.message || payload.body || payload.caption || "";
    const messageType = payload.image ? "image" : payload.audio ? "audio" : payload.document ? "document" : payload.video ? "video" : payload.sticker ? "sticker" : "text";

    // Skip if sent by us
    if (isFromMe) {
      console.log("Message from us, skipping");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Upsert contact
    const { data: contact } = await supabase
      .from("contacts")
      .upsert({ phone, tenant_id: tenantId, name: payload.senderName || null }, { onConflict: "phone,tenant_id" })
      .select()
      .single();

    let contactId: string;
    if (!contact) {
      const { data: existing } = await supabase.from("contacts").select("*").eq("phone", phone).eq("tenant_id", tenantId).maybeSingle();
      if (!existing) {
        const { data: newContact } = await supabase.from("contacts").insert({ phone, tenant_id: tenantId, name: payload.senderName || null }).select().single();
        if (!newContact) {
          console.error("Failed to create contact");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        contactId = newContact.id;
      } else {
        contactId = existing.id;
      }
    } else {
      contactId = contact.id;
    }

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        unread_count: (existingConv.unread_count || 0) + 1,
      }).eq("id", conversationId);
    } else {
      const { data: newConv } = await supabase.from("conversations").insert({
        tenant_id: tenantId,
        contact_id: contactId,
        whatsapp_connection_id: connection.id,
        status: "open",
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      }).select().single();
      conversationId = newConv!.id;
    }

    // Handle media download
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    const mediaData = payload.image || payload.audio || payload.document || payload.video || payload.sticker;
    if (mediaData?.imageUrl || mediaData?.audioUrl || mediaData?.documentUrl || mediaData?.videoUrl || mediaData?.stickerUrl) {
      const url = mediaData.imageUrl || mediaData.audioUrl || mediaData.documentUrl || mediaData.videoUrl || mediaData.stickerUrl;
      mediaMime = mediaData.mimetype || null;
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const ext = mediaMime?.split("/")?.[1] || "bin";
        const path = `${tenantId}/messages/${Date.now()}.${ext}`;
        await supabase.storage.from("media").upload(path, blob, { contentType: mediaMime || undefined });
        const { data: pubUrl } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrl = pubUrl.publicUrl;
      } catch (e) {
        console.error("Media download error:", e);
      }
    }

    // Insert message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: messageContent || null,
      role: "contact",
      message_type: messageType,
      media_url: mediaUrl,
      media_mime_type: mediaMime,
      zapi_message_id: payload.messageId || payload.id?.id || null,
    });

    console.log("Message stored for conversation:", conversationId);

    // AI Auto-Response
    const conv = existingConv || (await supabase.from("conversations").select("*").eq("id", conversationId).single()).data;
    if (conv && !conv.ai_paused && messageContent && messageType === "text") {
      console.log("Triggering AI auto-response for conversation:", conversationId);

      try {
        // Fetch agent config for this tenant
        const { data: agentConfig } = await supabase
          .from("agents_config")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        // Fetch recent conversation history for context (last 20 messages)
        const { data: history } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .eq("is_internal", false)
          .order("created_at", { ascending: true })
          .limit(20);

        // Fetch knowledge items for RAG context
        const { data: knowledgeItems } = await supabase
          .from("knowledge_items")
          .select("content, title")
          .eq("tenant_id", tenantId)
          .eq("status", "indexed")
          .limit(5);

        const knowledgeContext = knowledgeItems?.map(k => `[${k.title}]: ${k.content}`).join("\n\n") || "";

        const systemPrompt = agentConfig?.system_prompt || 
          "Você é um assistente de atendimento via WhatsApp. Seja educado, conciso e útil. Responda em português.";
        
        const persona = agentConfig?.persona || "Assistente virtual amigável";
        const model = agentConfig?.model || "google/gemini-3-flash-preview";
        const temperature = agentConfig?.temperature ?? 0.7;
        const blockedKeywords = agentConfig?.blocked_keywords || [];

        // Check for blocked keywords in the incoming message
        const hasBlockedKeyword = blockedKeywords.some((kw: string) => 
          messageContent.toLowerCase().includes(kw.toLowerCase())
        );

        if (hasBlockedKeyword) {
          console.log("Message contains blocked keyword, skipping AI response");
        } else {
          // Build messages array for AI
          const aiMessages: Array<{role: string; content: string}> = [
            { 
              role: "system", 
              content: `${systemPrompt}\n\nSua persona: ${persona}\n\n${knowledgeContext ? `Base de conhecimento:\n${knowledgeContext}\n\n` : ""}Regras:\n- Responda de forma concisa e direta, ideal para WhatsApp\n- Use no máximo 2-3 parágrafos curtos\n- Não use markdown formatado (negrito, itálico) pois WhatsApp tem formatação própria\n- Se não souber a resposta, diga que vai encaminhar para um atendente humano`
            },
          ];

          // Add conversation history
          if (history && history.length > 0) {
            for (const msg of history) {
              aiMessages.push({
                role: msg.role === "contact" ? "user" : "assistant",
                content: msg.content || "",
              });
            }
          }

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            console.error("LOVABLE_API_KEY not configured, skipping AI response");
          } else {
            console.log("Calling AI gateway with model:", model, "messages:", aiMessages.length);

            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: aiMessages,
                temperature,
                max_tokens: 500,
              }),
            });

            if (!aiResponse.ok) {
              const errText = await aiResponse.text();
              console.error("AI gateway error:", aiResponse.status, errText);
              if (aiResponse.status === 429) {
                console.log("Rate limited, skipping AI response");
              } else if (aiResponse.status === 402) {
                console.log("Payment required, skipping AI response");
              }
            } else {
              const aiData = await aiResponse.json();
              const aiReply = aiData.choices?.[0]?.message?.content;

              if (aiReply) {
                console.log("AI reply:", aiReply.slice(0, 100));

                // Store AI message in DB
                await supabase.from("messages").insert({
                  conversation_id: conversationId,
                  content: aiReply,
                  role: "ai",
                  message_type: "text",
                  delivery_status: "queued",
                });

                // Send via Z-API
                const sendUrl = `https://api.z-api.io/instances/${connection.zapi_instance_id}/token/${connection.zapi_token}/send-text`;
                const sendHeaders: Record<string, string> = { "Content-Type": "application/json" };
                if (connection.zapi_client_token) sendHeaders["Client-Token"] = connection.zapi_client_token;

                const sendResponse = await fetch(sendUrl, {
                  method: "POST",
                  headers: sendHeaders,
                  body: JSON.stringify({ phone, message: aiReply }),
                });

                const sendData = await sendResponse.json();
                console.log("Z-API send AI response:", JSON.stringify(sendData));

                // Update message with Z-API ID
                if (sendData.zapiMessageId || sendData.messageId) {
                  await supabase.from("messages").update({
                    zapi_message_id: sendData.zapiMessageId || sendData.messageId,
                    delivery_status: "sent",
                  }).eq("conversation_id", conversationId).eq("role", "ai").order("created_at", { ascending: false }).limit(1);
                }
              }
            }
          }
        }
      } catch (aiError) {
        console.error("AI auto-response error:", aiError);
        // Don't fail the webhook because of AI errors
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-webhook-received error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
