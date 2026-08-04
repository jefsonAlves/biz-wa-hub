import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, Filter, Pin, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ConversationListProps {
  conversations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  userId?: string;
  page: number;
  onPageChange: (p: number) => void;
  totalCount: number;
  departments?: any[];
  salesStatusFilter: string;
  onSalesStatusChange: (s: string) => void;
  departmentFilter: string;
  onDepartmentChange: (d: string) => void;
}

const filterTabs = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abertos" },
  { key: "waiting", label: "Pendentes" },
  { key: "unread", label: "Não lidas" },
  { key: "awaiting", label: "Aguardando" },
  { key: "answered", label: "Respondidas" },
  { key: "archived", label: "Arquivadas" },
  { key: "mine", label: "Meus" },
  { key: "unassigned", label: "Sem agente" },
];

const salesStatuses = [
  { key: "all", label: "Todos" },
  { key: "lead", label: "Lead" },
  { key: "negotiation", label: "NegociaÃ§Ã£o" },
  { key: "won", label: "Ganho" },
  { key: "lost", label: "Perdido" },
];

const PAGE_SIZE = 20;

export function ConversationList({
  conversations, selectedId, onSelect, filter, onFilterChange, search, onSearchChange, userId,
  page, onPageChange, totalCount, departments = [], salesStatusFilter, onSalesStatusChange,
  departmentFilter, onDepartmentChange,
}: ConversationListProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { onSearchChange(e.target.value); onPageChange(0); }}
            placeholder="Buscar nome ou telefone..."
            className="pl-9 h-9 bg-muted/50"
          />
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { onFilterChange(tab.key); onPageChange(0); }}
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
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              "text-xs px-2 py-1 rounded-full transition-colors ml-auto",
              showAdvanced ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            <Filter className="h-3 w-3" />
          </button>
        </div>
        {showAdvanced && (
          <div className="flex gap-2">
            <Select value={departmentFilter} onValueChange={(v) => { onDepartmentChange(v); onPageChange(0); }}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Depto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos deptos</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={salesStatusFilter} onValueChange={(v) => { onSalesStatusChange(v); onPageChange(0); }}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Vendas" />
              </SelectTrigger>
              <SelectContent>
                {salesStatuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conversa</p>
          </div>
        ) : (
          conversations.map((conv) => {
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
                    <span className={cn("flex min-w-0 items-center gap-1 font-medium text-sm", unread > 0 && "font-semibold text-foreground")}>{conv.is_pinned && <Pin className="h-3 w-3 flex-shrink-0 fill-current" />}<span className="truncate">{name}</span></span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{preview || phone}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {conv.ai_paused && (
                      <Badge variant="outline" className="text-xs py-0 h-4">IA off</Badge>
                    )}
                    {conv.departments?.name && (
                      <Badge variant="secondary" className="text-xs py-0 h-4">{conv.departments.name}</Badge>
                    )}
                    {conv.status === "archived" && <Badge variant="outline" className="text-xs py-0 h-4"><Archive className="mr-1 h-3 w-3" />Arquivada</Badge>}
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

      {/* Pagination footer */}
      {totalCount > 0 && (
        <div className="p-2 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {from}-{to} de {totalCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

