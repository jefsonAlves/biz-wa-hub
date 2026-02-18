import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GREEN_API_URL = "https://api.green-api.com";

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

    const { conversation_id, content, type = "text" } = await req.json();
    console.log("Sending message for conversation:", conversation_id);

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contacts(phone)")
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

    const phone = conversation.contacts?.phone?.replace(/\D/g, "");
    const chatId = `${phone}@c.us`;

    const instanceId = connection.zapi_instance_id;
    const apiToken = connection.zapi_token;

    const greenUrl = `${GREEN_API_URL}/waInstance${instanceId}/sendMessage/${apiToken}`;

    // Insert message in DB first
    const { data: message, error: msgError } = await supabase.from("messages").insert({
      conversation_id, content, role: "agent", message_type: type,
      author_id: user.id, delivery_status: "queued",
    }).select().single();

    if (msgError) throw msgError;

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
        zapi_message_id: greenData.idMessage,
        delivery_status: "sent",
      }).eq("id", message.id);
    }

    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    return new Response(JSON.stringify({ success: true, message_id: message.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("green-api-send error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});