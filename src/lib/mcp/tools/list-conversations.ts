import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_conversations",
  title: "Listar conversas",
  description:
    "Lista as conversas de WhatsApp da empresa do usuário, com contato, status e última mensagem.",
  inputSchema: {
    status: z
      .enum(["open", "waiting", "closed", "archived"])
      .optional()
      .describe("Filtra pelo status da conversa."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de conversas (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("conversations")
      .select(
        "id, status, sales_status, unread_count, ai_paused, ai_mode, last_message_at, created_at, contacts(name, phone, last_message_preview), departments(name)",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { conversations: data ?? [] },
    };
  },
});
