import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_conversation_messages",
  title: "Ler mensagens de uma conversa",
  description:
    "Retorna o histórico de mensagens de uma conversa de WhatsApp, em ordem cronológica.",
  inputSchema: {
    conversation_id: z.string().uuid().describe("ID da conversa."),
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de mensagens (padrão 50)."),
    include_internal: z
      .boolean()
      .optional()
      .describe("Inclui mensagens internas (padrão false)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ conversation_id, limit, include_internal }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("messages")
      .select("id, role, direction, content, message_type, media_url, delivery_status, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(limit ?? 50);
    if (!include_internal) query = query.eq("is_internal", false);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { messages: data ?? [] },
    };
  },
});
