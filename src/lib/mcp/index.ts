import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConversations from "./tools/list-conversations";
import getConversationMessages from "./tools/get-conversation-messages";
import searchContacts from "./tools/search-contacts";
import searchKnowledge from "./tools/search-knowledge";
import addInternalNote from "./tools/add-internal-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "remix-of-waba-flow-connect",
  title: "Remix of Waba Flow Connect",
  version: "0.1.0",
  instructions:
    "Ferramentas da plataforma de atendimento WhatsApp (AgentFlow). Use `list_conversations` para ver conversas, `get_conversation_messages` para ler o histórico de uma conversa, `search_contacts` para localizar contatos, `search_knowledge` para consultar a base de conhecimento e `add_internal_note` para registrar notas internas visíveis apenas à equipe. Todo acesso respeita o isolamento por empresa (tenant) do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listConversations,
    getConversationMessages,
    searchContacts,
    searchKnowledge,
    addInternalNote,
  ],
});
