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
      .single();

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

    if (!contact) {
      // If upsert fails (no unique constraint), try select then insert
      const { data: existing } = await supabase.from("contacts").select("*").eq("phone", phone).eq("tenant_id", tenantId).single();
      if (!existing) {
        const { data: newContact } = await supabase.from("contacts").insert({ phone, tenant_id: tenantId, name: payload.senderName || null }).select().single();
        if (!newContact) {
          console.error("Failed to create contact");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        var contactId = newContact.id;
      } else {
        var contactId = existing.id;
      }
    } else {
      var contactId = contact.id;
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
      .single();

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

    // Check if AI should respond
    const conv = existingConv || (await supabase.from("conversations").select("*").eq("id", conversationId).single()).data;
    if (conv && !conv.ai_paused && messageContent) {
      console.log("AI response would be triggered here (not yet implemented)");
      // TODO: Call AI gateway for auto-response
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
