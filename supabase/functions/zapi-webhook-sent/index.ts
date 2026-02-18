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
    console.log("GREEN-API webhook sent:", JSON.stringify(payload).slice(0, 500));

    // GREEN-API outgoing webhook: typeWebhook = "outgoingMessageStatus"
    const messageId = payload.idMessage;
    const status = payload.status;

    if (!messageId) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Map GREEN-API status to our status
    const statusMap: Record<string, string> = {
      pending: "queued",
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
      noAccount: "failed",
    };
    const deliveryStatus = statusMap[status] || status || "sent";

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
    console.error("green-api-webhook-sent error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});