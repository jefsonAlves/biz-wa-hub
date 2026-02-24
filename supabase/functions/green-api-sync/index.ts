import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function fetchContactInfo(apiUrl: string, instanceId: string, token: string, chatId: string) {
  try {
    const resp = await fetch(`${apiUrl}/waInstance${instanceId}/getContactInfo/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.error("getContactInfo error for", chatId, e);
    return null;
  }
}

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwtToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { tenant_id, connection_id } = await req.json();

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
    const cutoffDate = new Date(Date.now() - THIRTY_DAYS_MS);

    await supabase.from("whatsapp_connections").update({ sync_status: "syncing" }).eq("id", connection_id);

    let contactsSynced = 0;
    let conversationsSynced = 0;
    let messagesSynced = 0;

    try {
      // 1. Fetch recent chats (activity-first approach)
      console.log("Fetching recent chats from GREEN-API...");
      const chatsResp = await fetch(`${apiUrl}/waInstance${instanceId}/getChats/${token}`);
      if (!chatsResp.ok) throw new Error(`getChats failed: ${chatsResp.status}`);
      const chatsData = await chatsResp.json();
      
      // 2. Filter: only @c.us, no groups, limit 100
      const recentChats = (Array.isArray(chatsData) ? chatsData : [])
        .filter((ch: any) => ch.id && ch.id.endsWith("@c.us") && !ch.id.startsWith("0@"))
        .slice(0, 100);

      console.log(`Recent chats (filtered @c.us): ${recentChats.length}`);

      // 3. For each recent chat: get contact info, upsert contact, create conversation, fetch history
      for (const chat of recentChats) {
        const chatId = chat.id;
        const phone = chatId.replace("@c.us", "");

        // 3a. Get contact info (name + avatar)
        const info = await fetchContactInfo(apiUrl, instanceId, token, chatId);
        const name = info?.name || info?.contactName || info?.chatName || chat.name || null;
        const avatarUrl = info?.avatar || null;
        await delay(300);

        // 3b. Upsert contact
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id, name, avatar_url")
          .eq("tenant_id", tenant_id)
          .eq("phone", phone)
          .maybeSingle();

        let contactId: string;

        if (existingContact) {
          contactId = existingContact.id;
          const updates: any = { wa_chat_id: chatId };
          if (name && (!existingContact.name || existingContact.name === phone)) updates.name = name;
          if (avatarUrl && !existingContact.avatar_url) updates.avatar_url = avatarUrl;
          await supabase.from("contacts").update(updates).eq("id", contactId);
        } else {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({ tenant_id, phone, name, avatar_url: avatarUrl, wa_chat_id: chatId })
            .select("id")
            .single();
          if (!newContact) continue;
          contactId = newContact.id;
        }
        contactsSynced++;

        // 3c. Create conversation if not exists
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("contact_id", contactId)
          .maybeSingle();

        let convId: string;
        if (existingConv) {
          convId = existingConv.id;
        } else {
          const { data: newConv } = await supabase
            .from("conversations")
            .insert({
              tenant_id,
              contact_id: contactId,
              whatsapp_connection_id: connection_id,
              wa_chat_id: chatId,
              status: "open",
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (!newConv) continue;
          convId = newConv.id;
          conversationsSynced++;
        }

        // 3d. Fetch chat history (last 30 messages, filtered to 30 days)
        try {
          const historyResp = await fetch(`${apiUrl}/waInstance${instanceId}/getChatHistory/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, count: 30 }),
          });

          if (!historyResp.ok) continue;
          const history = await historyResp.json();
          if (!Array.isArray(history)) continue;

          let latestTimestamp: string | null = null;
          let latestContent: string | null = null;

          for (const msg of history) {
            if (!msg.idMessage) continue;

            // Filter: only messages from last 30 days
            const msgDate = msg.timestamp ? new Date(msg.timestamp * 1000) : null;
            if (msgDate && msgDate < cutoffDate) continue;

            const { data: existing } = await supabase
              .from("messages")
              .select("id")
              .eq("wa_message_id", msg.idMessage)
              .maybeSingle();
            if (existing) continue;

            const direction = msg.type === "outgoing" ? "outgoing" : "incoming";
            const role = direction === "outgoing" ? "agent" : "contact";
            const content = msg.textMessage || msg.caption || null;
            const createdAt = msgDate ? msgDate.toISOString() : new Date().toISOString();

            await supabase.from("messages").insert({
              conversation_id: convId,
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

            if (!latestTimestamp || createdAt > latestTimestamp) {
              latestTimestamp = createdAt;
              latestContent = content;
            }
          }

          if (latestTimestamp) {
            await supabase.from("conversations").update({ last_message_at: latestTimestamp }).eq("id", convId);
            if (latestContent) {
              await supabase.from("contacts").update({ last_message_preview: latestContent.slice(0, 100) }).eq("id", contactId);
            }
          }

          await delay(400);
        } catch (histErr) {
          console.error("History error for", chatId, histErr);
        }
      }

      // Success
      await supabase.from("whatsapp_connections").update({
        sync_status: "synced",
        last_connected_at: new Date().toISOString(),
      }).eq("id", connection_id);

      console.log(`Sync complete: ${contactsSynced} contacts, ${conversationsSynced} conversations, ${messagesSynced} messages`);

      return new Response(JSON.stringify({
        success: true,
        contacts_synced: contactsSynced,
        conversations_synced: conversationsSynced,
        messages_synced: messagesSynced,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (syncError) {
      console.error("Sync error:", syncError);
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
