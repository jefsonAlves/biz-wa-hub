import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_contacts",
  title: "Buscar contatos",
  description: "Busca contatos da empresa por nome, telefone ou e-mail.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Texto para buscar em nome, telefone ou e-mail."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de contatos (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, email, tags, last_message_preview, created_at")
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { contacts: data ?? [] },
    };
  },
});
