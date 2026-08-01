import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_knowledge",
  title: "Consultar base de conhecimento",
  description:
    "Busca itens indexados na base de conhecimento da empresa por título ou conteúdo.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Texto para buscar no título ou conteúdo."),
    limit: z.number().int().min(1).max(20).optional().describe("Máximo de itens (padrão 5)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("knowledge_items")
      .select("id, title, type, status, content, source_url, updated_at")
      .eq("status", "indexed")
      .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 5);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
