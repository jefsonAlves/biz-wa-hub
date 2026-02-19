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

    const jwtToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(jwtToken);
    const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { tenant_id, connection_id } = await req.json();

    // Get connection
    const { data: connection, error: connError } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("id", connection_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "Conexão não encontrada" }), { status: 404, headers: corsHeaders });
    }

    const apiUrl = connection.api_url || "https://api.green-api.com";
    const instanceId = connection.zapi_instance_id;
    const token = connection.zapi_token;

    // Update sync status
    await supabase.from("whatsapp_connections").update({ sync_status: "syncing" }).eq("id", connection_id);

    let contactsSynced = 0;
    let conversationsSynced = 0;
    let messagesSynced = 0;

    try {
      // 1. Fetch contacts from GREEN-API
      console.log("Fetching contacts from GREEN-API...");
      const contactsResp = await fetch(`${apiUrl}/waInstance${instanceId}/getContacts/${token}`);
      const contactsData = await contactsResp.json();
      console.log("Contacts response:", JSON.stringify(contactsData).slice(0, 200));

      const contacts = Array.isArray(contactsData) ? contactsData : [];

      // Process each contact
      for (const contact of contacts) {
        if (!contact.id || !contact.id.includes("@c.us")) continue; // skip groups and invalid

        const phone = contact.id.replace("@c.us", "");
        const name = contact.name || contact.shortName || null;
        const waChatId = contact.id;

        // Upsert contact
        const { data: upsertedContact } = await supabase
          .from("contacts")
          .upsert({
            tenant_id,
            phone,
            name,
            wa_chat_id: waChatId,
          }, { onConflict: "tenant_id,phone" })
          .select()
          .single();

        if (upsertedContact) {
          contactsSynced++;

          // Create conversation if not exists
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("contact_id", upsertedContact.id)
            .maybeSingle();

          if (!existingConv) {
            await supabase.from("conversations").insert({
              tenant_id,
              contact_id: upsertedContact.id,
              whatsapp_connection_id: connection_id,
              wa_chat_id: waChatId,
              status: "open",
              last_message_at: new Date().toISOString(),
            });
            conversationsSynced++;
          }
        }
      }

      // 2. Fetch chat history for each conversation
      console.log("Fetching chat history...");
      const { data: conversations } = await supabase
        .from("conversations")
        .select("*, contacts(phone, wa_chat_id)")
        .eq("tenant_id", tenant_id)
        .not("contacts.wa_chat_id", "is", null)
        .limit(50);

      for (const conv of (conversations || [])) {
        const chatId = conv.contacts?.wa_chat_id || (conv.contacts?.phone ? `${conv.contacts.phone}@c.us` : null);
        if (!chatId) continue;

        try {
          const historyResp = await fetch(`${apiUrl}/waInstance${instanceId}/getChatHistory/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, count: 30 }),
          });

          if (!historyResp.ok) continue;
          const history = await historyResp.json();
          if (!Array.isArray(history)) continue;

          for (const msg of history) {
            if (!msg.idMessage) continue;

            // Check if message already exists
            const { data: existing } = await supabase
              .from("messages")
              .select("id")
              .eq("wa_message_id", msg.idMessage)
              .maybeSingle();

            if (existing) continue;

            const direction = msg.type === "outgoing" ? "outgoing" : "incoming";
            const role = direction === "outgoing" ? "agent" : "contact";
            const content = msg.textMessage || msg.caption || null;
            const createdAt = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();

            await supabase.from("messages").insert({
              conversation_id: conv.id,
              content,
              role,
              direction,
              wa_message_id: msg.idMessage,
              zapi_message_id: msg.idMessage,
              message_type: "text",
              delivery_status: "delivered",
              created_at: createdAt,
            });

            messagesSynced++;

            // Update conversation last_message_at
            if (content) {
              await supabase.from("conversations").update({
                last_message_at: createdAt,
              }).eq("id", conv.id).lt("last_message_at", createdAt);

              // Update contact preview
              if (conv.contacts?.wa_chat_id) {
                await supabase.from("contacts").update({
                  last_message_preview: content.slice(0, 100),
                  last_message_at: createdAt,
                }).eq("tenant_id", tenant_id).eq("wa_chat_id", conv.contacts.wa_chat_id);
              }
            }
          }
        } catch (histErr) {
          console.error("History fetch error for", chatId, histErr);
        }
      }

      await supabase.from("whatsapp_connections").update({ sync_status: "synced" }).eq("id", connection_id);

      return new Response(JSON.stringify({
        success: true,
        contacts_synced: contactsSynced,
        conversations_synced: conversationsSynced,
        messages_synced: messagesSynced,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (syncError) {
      await supabase.from("whatsapp_connections").update({ sync_status: "error" }).eq("id", connection_id);
      throw syncError;
    }

  } catch (error) {
    console.error("green-api-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
