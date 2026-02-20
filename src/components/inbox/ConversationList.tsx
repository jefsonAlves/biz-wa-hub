import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  userId?: string;
}

const filterTabs = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abertos" },
  { key: "waiting", label: "Pendentes" },
  { key: "mine", label: "Meus" },
  { key: "unassigned", label: "Sem agente" },
];

export function ConversationList({
  conversations, selectedId, onSelect, filter, onFilterChange, search, onSearchChange, userId,
}: ConversationListProps) {
  const filtered = conversations.filter((c) => {
    const name = c.contacts?.name || c.contacts?.phone || "";
    const phone = c.contacts?.phone || "";
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
    if (!matchSearch) return false;
    if (filter === "open") return c.status === "open";
    if (filter === "waiting") return c.status === "waiting";
    if (filter === "closed") return c.status === "closed";
    if (filter === "mine") return c.assigned_agent_id === userId;
    if (filter === "unassigned") return !c.assigned_agent_id;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-9 h-9 bg-muted/50"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className={cn(
                "text-xs px-2 py-1 rounded-full transition-colors",
                filter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conversa</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const name = conv.contacts?.name || conv.contacts?.phone || "Desconhecido";
            const phone = conv.contacts?.phone || "";
            const preview = conv.contacts?.last_message_preview || "";
            const time = conv.last_message_at
              ? new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : "";
            const isSelected = selectedId === conv.id;
            const unread = conv.unread_count || 0;
            const statusDot =
              conv.status === "open" ? "bg-green-500" :
              conv.status === "waiting" ? "bg-yellow-500" : "bg-muted-foreground";

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "flex items-start gap-3 p-3 border-b border-border/50 cursor-pointer transition-colors",
                  isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                )}
              >
                <div className="relative flex-shrink-0">
                  {conv.contacts?.avatar_url ? (
                    <img
                      src={conv.contacts.avatar_url}
                      alt={name}
                      className="w-11 h-11 rounded-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                    />
                  ) : null}
                  <div className={cn(
                    "w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm",
                    conv.contacts?.avatar_url ? "hidden" : ""
                  )}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className={cn("absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background", statusDot)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn("font-medium text-sm truncate", unread > 0 && "font-semibold text-foreground")}>{name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{preview || phone}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {conv.ai_paused && (
                      <Badge variant="outline" className="text-xs py-0 h-4">IA off</Badge>
                    )}
                    {unread > 0 && (
                      <Badge className="text-xs py-0 h-4 ml-auto">{unread}</Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}
