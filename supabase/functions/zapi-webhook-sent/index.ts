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
    console.log("Webhook sent payload:", JSON.stringify(payload).slice(0, 500));

    const messageId = payload.ids?.[0]?.id || payload.messageId || payload.id?.id;
    const status = payload.status || payload.ack?.toLowerCase() || "delivered";

    if (!messageId) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Map Z-API status to our status
    const statusMap: Record<string, string> = {
      PENDING: "queued", SENT: "sent", RECEIVED: "delivered",
      READ: "read", PLAYED: "read", FAILED: "failed",
    };
    const deliveryStatus = statusMap[status.toUpperCase()] || status;

    const { error } = await supabase
      .from("messages")
      .update({ delivery_status: deliveryStatus })
      .eq("zapi_message_id", messageId);

    if (error) console.error("Error updating delivery status:", error);
    else console.log("Updated message", messageId, "to status", deliveryStatus);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-webhook-sent error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
