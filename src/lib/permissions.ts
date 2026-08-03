export type PermissionKey = string;

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  description: string;
}

export interface PermissionGroup {
  group: string;
  items: PermissionDef[];
}

/** Catálogo de permissões disponíveis para funções personalizadas da equipe. */
export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    group: "Atendimento",
    items: [
      { key: "inbox.view", label: "Ver Inbox", description: "Acessar a lista de conversas" },
      { key: "inbox.reply", label: "Responder conversas", description: "Enviar mensagens ao contato" },
      { key: "inbox.assign_self", label: "Assumir conversas", description: "Atribuir conversas para si" },
      { key: "inbox.assign_others", label: "Distribuir conversas", description: "Atribuir conversas a outros membros" },
      { key: "inbox.close", label: "Encerrar conversas", description: "Fechar ou arquivar atendimentos" },
      { key: "inbox.all_departments", label: "Ver todos os departamentos", description: "Sem restrição de setor" },
    ],
  },
  {
    group: "Contatos e CRM",
    items: [
      { key: "contacts.view", label: "Ver contatos", description: "Consultar a base de contatos" },
      { key: "contacts.edit", label: "Editar contatos", description: "Alterar nome, tags e dados" },
      { key: "notes.manage", label: "Notas internas", description: "Criar notas visíveis só para a equipe" },
      { key: "schedules.manage", label: "Mensagens agendadas", description: "Criar e cancelar agendamentos" },
      { key: "crm.update_status", label: "Atualizar funil", description: "Mudar status de venda (Lead, Ganho...)" },
    ],
  },
  {
    group: "Inteligência Artificial",
    items: [
      { key: "ai.toggle_conversation", label: "Pausar/ativar IA na conversa", description: "Controlar a IA em atendimentos" },
      { key: "ai.use_suggestions", label: "Usar sugestões da IA", description: "Gerar respostas sugeridas" },
      { key: "ai.manage_agents", label: "Configurar agentes de IA", description: "Criar e editar personas de IA" },
      { key: "knowledge.manage", label: "Base de conhecimento", description: "Adicionar e remover conteúdos" },
    ],
  },
  {
    group: "Gestão",
    items: [
      { key: "reports.view", label: "Ver relatórios", description: "Acessar métricas e relatórios" },
      { key: "departments.manage", label: "Gerenciar departamentos", description: "Criar, editar e excluir setores" },
      { key: "team.manage", label: "Gerenciar equipe", description: "Convidar, editar e remover membros" },
      { key: "connections.manage", label: "Conexões WhatsApp", description: "Conectar e desconectar números" },
      { key: "settings.manage", label: "Configurações da empresa", description: "Alterar preferências gerais" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_CATALOG.flatMap((g) =>
  g.items.map((i) => i.key),
);

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);

/** Presets usados ao criar funções novas. */
export const ROLE_PRESETS: Record<string, PermissionKey[]> = {
  agent: [
    "inbox.view",
    "inbox.reply",
    "inbox.assign_self",
    "inbox.close",
    "contacts.view",
    "contacts.edit",
    "notes.manage",
    "schedules.manage",
    "crm.update_status",
    "ai.use_suggestions",
    "ai.toggle_conversation",
    "reports.view",
  ],
  viewer: ["inbox.view", "contacts.view", "reports.view"],
  supervisor: [
    "inbox.view",
    "inbox.reply",
    "inbox.assign_self",
    "inbox.assign_others",
    "inbox.close",
    "inbox.all_departments",
    "contacts.view",
    "contacts.edit",
    "notes.manage",
    "schedules.manage",
    "crm.update_status",
    "ai.use_suggestions",
    "ai.toggle_conversation",
    "reports.view",
    "departments.manage",
  ],
};
