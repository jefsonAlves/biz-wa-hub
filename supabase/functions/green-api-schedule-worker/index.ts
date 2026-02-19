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

    // Fetch queued schedules that are due
    const now = new Date().toISOString();
    const { data: dueSchedules, error } = await supabase
      .from("schedules")
      .select("*, conversations(whatsapp_connection_id, tenant_id)")
      .eq("status", "queued")
      .lte("run_at", now)
      .limit(20);

    if (error) throw error;

    console.log(`Processing ${dueSchedules?.length || 0} due schedules`);

    for (const schedule of (dueSchedules || [])) {
      try {
        const conv = schedule.conversations as any;
        if (!conv?.whatsapp_connection_id) {
          await supabase.from("schedules").update({
            status: "failed",
            fail_reason: "No whatsapp connection found",
          }).eq("id", schedule.id);
          continue;
        }

        // Get WhatsApp connection
        const { data: connection } = await supabase
          .from("whatsapp_connections")
          .select("*")
          .eq("id", conv.whatsapp_connection_id)
          .single();

        if (!connection) {
          await supabase.from("schedules").update({
            status: "failed",
            fail_reason: "WhatsApp connection not found",
          }).eq("id", schedule.id);
          continue;
        }

        const apiUrl = connection.api_url || "https://api.green-api.com";
        const sendUrl = `${apiUrl}/waInstance${connection.zapi_instance_id}/sendMessage/${connection.zapi_token}`;

        // Send message
        const sendResp = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: schedule.to_chat_id,
            message: schedule.message_body,
          }),
        });

        const sendData = await sendResp.json();
        console.log(`Schedule ${schedule.id} send response:`, JSON.stringify(sendData));

        if (sendData.idMessage) {
          // Success - update schedule and insert message
          await supabase.from("schedules").update({ status: "sent" }).eq("id", schedule.id);

          await supabase.from("messages").insert({
            conversation_id: schedule.conversation_id,
            content: schedule.message_body,
            role: "agent",
            direction: "outgoing",
            message_type: "text",
            delivery_status: "sent",
            wa_message_id: sendData.idMessage,
            zapi_message_id: sendData.idMessage,
            author_id: schedule.created_by_user_id,
          });

          await supabase.from("conversations").update({
            last_message_at: new Date().toISOString(),
          }).eq("id", schedule.conversation_id);

        } else {
          await supabase.from("schedules").update({
            status: "failed",
            fail_reason: sendData.error || JSON.stringify(sendData),
          }).eq("id", schedule.id);
        }

      } catch (scheduleError: any) {
        console.error(`Error processing schedule ${schedule.id}:`, scheduleError);
        await supabase.from("schedules").update({
          status: "failed",
          fail_reason: scheduleError.message,
        }).eq("id", schedule.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: dueSchedules?.length || 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("schedule-worker error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
