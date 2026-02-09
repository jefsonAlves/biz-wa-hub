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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_URL")!.includes("supabase") ? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")! : "",
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { conversation_id, content, type = "text" } = await req.json();
    console.log("Sending message for conversation:", conversation_id);

    // Get conversation with tenant info
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contacts(phone)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), { status: 404, headers: corsHeaders });
    }

    // Get Z-API credentials
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("tenant_id", conversation.tenant_id)
      .limit(1)
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: "Z-API não configurado" }), { status: 400, headers: corsHeaders });
    }

    const phone = conversation.contacts?.phone?.replace(/\D/g, "");
    const zapiUrl = `https://api.z-api.io/instances/${connection.zapi_instance_id}/token/${connection.zapi_token}/send-text`;
    const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (connection.zapi_client_token) zapiHeaders["Client-Token"] = connection.zapi_client_token;

    // Insert message in DB first
    const { data: message, error: msgError } = await supabase.from("messages").insert({
      conversation_id, content, role: "agent", message_type: type,
      author_id: user.id, delivery_status: "queued",
    }).select().single();

    if (msgError) throw msgError;

    // Send via Z-API
    const zapiResponse = await fetch(zapiUrl, {
      method: "POST",
      headers: zapiHeaders,
      body: JSON.stringify({ phone, message: content }),
    });

    const zapiData = await zapiResponse.json();
    console.log("Z-API send response:", JSON.stringify(zapiData));

    // Update message with Z-API ID
    if (zapiData.zapiMessageId || zapiData.messageId) {
      await supabase.from("messages").update({
        zapi_message_id: zapiData.zapiMessageId || zapiData.messageId,
        delivery_status: "sent",
      }).eq("id", message.id);
    }

    // Update conversation last_message_at
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    return new Response(JSON.stringify({ success: true, message_id: message.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-send error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
