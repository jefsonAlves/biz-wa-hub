import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    await supabase.from("whatsapp_connections").update({ sync_status: "syncing" }).eq("id", connection_id);

    let contactsSynced = 0;
    let conversationsSynced = 0;
    let messagesSynced = 0;

    try {
      // 1. Fetch contacts from GREEN-API
      console.log("Fetching contacts from GREEN-API...");
      const contactsResp = await fetch(`${apiUrl}/waInstance${instanceId}/getContacts/${token}`);
      const contactsData = await contactsResp.json();
      const allContacts = Array.isArray(contactsData) ? contactsData : [];

      // 2. Filter: only @c.us (no groups), skip 0@c.us
      const validContacts = allContacts.filter((c: any) =>
        c.id && c.id.endsWith("@c.us") && !c.id.startsWith("0@")
      );

      console.log(`Total contacts: ${allContacts.length}, valid @c.us: ${validContacts.length}`);

      // 3. Process contacts - fetch names/avatars via getContactInfo for those without names
      // Limit to 150 contacts to avoid timeout
      const contactsToProcess = validContacts.slice(0, 150);
      const contactRecords: Array<{ phone: string; name: string | null; avatar_url: string | null; wa_chat_id: string }> = [];

      for (const contact of contactsToProcess) {
        const phone = contact.id.replace("@c.us", "");
        let name = contact.name || contact.contactName || contact.shortName || null;
        let avatarUrl: string | null = null;

        // If no name, fetch from getContactInfo
        if (!name || name === phone) {
          const info = await fetchContactInfo(apiUrl, instanceId, token, contact.id);
          if (info) {
            name = info.name || info.contactName || info.chatName || null;
            avatarUrl = info.avatar || null;
          }
          await delay(300); // Rate limiting
        } else {
          // Even if we have a name, try to get avatar (but batch less aggressively)
          // Only for first 50 to save time
          if (contactRecords.length < 50) {
            const info = await fetchContactInfo(apiUrl, instanceId, token, contact.id);
            if (info) {
              avatarUrl = info.avatar || null;
              // Update name if getContactInfo has a better one
              if (!name && (info.name || info.contactName)) {
                name = info.name || info.contactName;
              }
            }
            await delay(200);
          }
        }

        contactRecords.push({ phone, name, avatar_url: avatarUrl, wa_chat_id: contact.id });
      }

      console.log(`Fetched info for ${contactRecords.length} contacts`);

      // 4. Upsert contacts in batch
      for (const rec of contactRecords) {
        const updateData: any = { wa_chat_id: rec.wa_chat_id };
        if (rec.name) updateData.name = rec.name;
        if (rec.avatar_url) updateData.avatar_url = rec.avatar_url;

        const { data: existing } = await supabase
          .from("contacts")
          .select("id, name, avatar_url")
          .eq("tenant_id", tenant_id)
          .eq("phone", rec.phone)
          .maybeSingle();

        if (existing) {
          // Only update if we have better data
          const updates: any = { wa_chat_id: rec.wa_chat_id };
          if (rec.name && (!existing.name || existing.name === rec.phone)) updates.name = rec.name;
          if (rec.avatar_url && !existing.avatar_url) updates.avatar_url = rec.avatar_url;
          await supabase.from("contacts").update(updates).eq("id", existing.id);
          contactsSynced++;
        } else {
          await supabase.from("contacts").insert({
            tenant_id,
            phone: rec.phone,
            name: rec.name,
            avatar_url: rec.avatar_url,
            wa_chat_id: rec.wa_chat_id,
          });
          contactsSynced++;
        }
      }

      // 5. Fetch recent chats to know which contacts have activity
      console.log("Fetching recent chats...");
      let recentChatIds: string[] = [];
      try {
        const chatsResp = await fetch(`${apiUrl}/waInstance${instanceId}/getChats/${token}`);
        if (chatsResp.ok) {
          const chatsData = await chatsResp.json();
          if (Array.isArray(chatsData)) {
            recentChatIds = chatsData
              .filter((ch: any) => ch.id && ch.id.endsWith("@c.us"))
              .map((ch: any) => ch.id);
          }
        }
      } catch (e) {
        console.error("getChats error:", e);
      }

      console.log(`Recent chats: ${recentChatIds.length}`);

      // 6. Create conversations only for contacts with recent chats
      const contactsWithChats = recentChatIds.length > 0 ? recentChatIds : contactRecords.slice(0, 50).map(c => c.wa_chat_id);

      for (const chatId of contactsWithChats) {
        const phone = chatId.replace("@c.us", "");

        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("phone", phone)
          .maybeSingle();

        if (!contact) continue;

        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("contact_id", contact.id)
          .maybeSingle();

        if (!existingConv) {
          await supabase.from("conversations").insert({
            tenant_id,
            contact_id: contact.id,
            whatsapp_connection_id: connection_id,
            wa_chat_id: chatId,
            status: "open",
            last_message_at: new Date().toISOString(),
          });
          conversationsSynced++;
        }
      }

      // 7. Fetch chat history for conversations (limit to 30 most recent)
      console.log("Fetching chat history...");
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, wa_chat_id, contact_id, contacts(phone, wa_chat_id)")
        .eq("tenant_id", tenant_id)
        .order("last_message_at", { ascending: false })
        .limit(30);

      for (const conv of (conversations || [])) {
        const chatId = conv.wa_chat_id || conv.contacts?.wa_chat_id || (conv.contacts?.phone ? `${conv.contacts.phone}@c.us` : null);
        if (!chatId) continue;

        try {
          await delay(500);

          const historyResp = await fetch(`${apiUrl}/waInstance${instanceId}/getChatHistory/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, count: 20 }),
          });

          if (!historyResp.ok) continue;
          const history = await historyResp.json();
          if (!Array.isArray(history)) continue;

          let latestTimestamp: string | null = null;
          let latestContent: string | null = null;

          for (const msg of history) {
            if (!msg.idMessage) continue;

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

            if (!latestTimestamp || createdAt > latestTimestamp) {
              latestTimestamp = createdAt;
              latestContent = content;
            }
          }

          // Update conversation and contact with latest message info
          if (latestTimestamp) {
            await supabase.from("conversations").update({
              last_message_at: latestTimestamp,
            }).eq("id", conv.id);

            if (latestContent) {
              await supabase.from("contacts").update({
                last_message_preview: latestContent.slice(0, 100),
              }).eq("id", conv.contact_id);
            }
          }
        } catch (histErr) {
          console.error("History fetch error for", chatId, histErr);
        }
      }

      // 8. Mark sync as complete
      await supabase.from("whatsapp_connections").update({ sync_status: "synced" }).eq("id", connection_id);

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
