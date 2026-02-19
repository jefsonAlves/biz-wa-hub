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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { conversation_id, content, type = "text", mode = "send" } = await req.json();
    console.log("Sending message for conversation:", conversation_id, "mode:", mode);

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contacts(phone, wa_chat_id)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), { status: 404, headers: corsHeaders });
    }

    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("tenant_id", conversation.tenant_id)
      .limit(1)
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: "GREEN-API não configurado" }), { status: 400, headers: corsHeaders });
    }

    const contact = conversation.contacts as any;
    const chatId = contact?.wa_chat_id || (contact?.phone ? `${contact.phone.replace(/\D/g, "")}@c.us` : null);

    if (!chatId) {
      return new Response(JSON.stringify({ error: "Chat ID não encontrado" }), { status: 400, headers: corsHeaders });
    }

    // If mode is "suggest", just save as draft without sending
    if (mode === "suggest") {
      const { data: message, error: msgError } = await supabase.from("messages").insert({
        conversation_id,
        content,
        role: "ai",
        direction: "outgoing",
        message_type: type,
        author_id: user.id,
        delivery_status: "draft",
        is_internal: false,
      }).select().single();

      if (msgError) throw msgError;

      return new Response(JSON.stringify({ success: true, message_id: message.id, mode: "suggest" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert message in DB first
    const { data: message, error: msgError } = await supabase.from("messages").insert({
      conversation_id,
      content,
      role: "agent",
      direction: "outgoing",
      message_type: type,
      author_id: user.id,
      delivery_status: "queued",
    }).select().single();

    if (msgError) throw msgError;

    const apiUrl = connection.api_url || "https://api.green-api.com";
    const greenUrl = `${apiUrl}/waInstance${connection.zapi_instance_id}/sendMessage/${connection.zapi_token}`;

    // Send via GREEN-API
    const greenResponse = await fetch(greenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message: content }),
    });

    const greenData = await greenResponse.json();
    console.log("GREEN-API send response:", JSON.stringify(greenData));

    if (greenData.idMessage) {
      await supabase.from("messages").update({
        wa_message_id: greenData.idMessage,
        zapi_message_id: greenData.idMessage,
        delivery_status: "sent",
      }).eq("id", message.id);
    } else {
      await supabase.from("messages").update({ delivery_status: "failed" }).eq("id", message.id);
    }

    // Update conversation last_message_at and contact preview
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);
    if (contact?.wa_chat_id) {
      await supabase.from("contacts").update({
        last_message_preview: content.slice(0, 100),
      }).eq("wa_chat_id", contact.wa_chat_id).eq("tenant_id", conversation.tenant_id);
    }

    return new Response(JSON.stringify({ success: true, message_id: message.id, wa_message_id: greenData.idMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-send error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
