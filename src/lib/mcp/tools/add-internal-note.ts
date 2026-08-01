import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_internal_note",
  title: "Adicionar nota interna",
  description:
    "Cria uma nota interna em uma conversa. A nota é visível apenas para a equipe e nunca é enviada ao cliente pelo WhatsApp.",
  inputSchema: {
    conversation_id: z.string().uuid().describe("ID da conversa."),
    note_text: z.string().trim().min(1).describe("Texto da nota interna."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ conversation_id, note_text }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const userId = ctx.getUserId();
    if (!userId) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, tenant_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (convError) return { content: [{ type: "text", text: convError.message }], isError: true };
    if (!conversation) {
      return {
        content: [{ type: "text", text: "Conversa não encontrada ou sem acesso." }],
        isError: true,
      };
    }

    const { data, error } = await supabase
      .from("internal_notes")
      .insert({
        conversation_id,
        tenant_id: conversation.tenant_id,
        user_id: userId,
        note_text,
      })
      .select("id, note_text, created_at")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Nota interna criada (${data.id}).` }],
      structuredContent: { note: data },
    };
  },
});
