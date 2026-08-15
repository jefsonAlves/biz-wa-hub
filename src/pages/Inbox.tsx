import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare, Pause, Play, UserCheck, Bot, Sparkles, Loader2 } from "lucide-react";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { InternalNotes } from "@/components/inbox/InternalNotes";
import { ActionMenu } from "@/components/inbox/ActionMenu";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/lib/whatsapp/provider";

// --- Notification sound via Web Audio API ---
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  } catch { /* no AudioContext */ }
}

const PAGE_SIZE = 20;

const Inbox = () => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [salesStatusFilter, setSalesStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [inputTab, setInputTab] = useState<"message" | "internal">("message");
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [unreadBadge, setUnreadBadge] = useState(0);
  const originalTitleRef = useRef(document.title);
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Conversations with server-side pagination
  const { data: conversationsData, isLoading: convsLoading } = useQuery({
    queryKey: ["conversations", tenantId, page, filter, search, salesStatusFilter, departmentFilter],
    queryFn: async () => {
      if (!tenantId) return { data: [], count: 0 };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("conversations")
        .select("*, contacts!inner(name, phone, wa_chat_id, last_message_preview, avatar_url, quarantined_at), departments(name)", { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("contacts.quarantined_at", null)
        .order("is_pinned", { ascending: false })
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("last_message_at", { ascending: false })
        .range(from, to);

      // Apply filters
      if (filter === "open") query = query.eq("status", "open");
      else if (filter === "waiting") query = query.eq("status", "waiting");
      else if (filter === "unread") query = query.gt("unread_count", 0).neq("status", "archived");
      else if (filter === "awaiting") query = query.eq("awaiting_reply", true).neq("status", "archived");
      else if (filter === "answered") query = query.eq("last_message_direction", "outgoing").neq("status", "archived");
      else if (filter === "archived") query = query.eq("status", "archived");
      else if (filter === "mine" && user?.id) query = query.eq("assigned_agent_id", user.id);
      else if (filter === "unassigned") query = query.is("assigned_agent_id", null);
      else query = query.neq("status", "archived");

      if (salesStatusFilter !== "all") query = query.eq("sales_status", salesStatusFilter as any);
      if (departmentFilter !== "all") query = query.eq("department_id", departmentFilter);

      // Search by contact name or phone via textSearch workaround
      if (search.trim()) {
        query = query.or(`contacts.name.ilike.%${search}%,contacts.phone.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!tenantId,
  });

  const conversations = conversationsData?.data || [];
  const totalCount = conversationsData?.count || 0;

  const { data: inboxMetrics = { unread: 0, awaiting: 0, answered: 0 } } = useQuery({
    queryKey: ["inbox-metrics", tenantId],
    queryFn: async () => {
      if (!tenantId) return { unread: 0, awaiting: 0, answered: 0 };
      const [unreadResult, awaitingResult, answeredResult] = await Promise.all([
        supabase.from("conversations").select("unread_count").eq("tenant_id", tenantId).neq("status", "archived").gt("unread_count", 0),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "archived").eq("awaiting_reply", true),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "archived").eq("last_message_direction", "outgoing"),
      ]);
      if (unreadResult.error) throw unreadResult.error;
      if (awaitingResult.error) throw awaitingResult.error;
      if (answeredResult.error) throw answeredResult.error;
      return {
        unread: (unreadResult.data ?? []).reduce((sum, row) => sum + (row.unread_count ?? 0), 0),
        awaiting: awaitingResult.count ?? 0,
        answered: answeredResult.count ?? 0,
      };
    },
    enabled: !!tenantId,
  });

  // Messages
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedConversationId);
      queryClient.invalidateQueries({ queryKey: ["inbox-metrics", tenantId] });
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedConversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConversationId,
  });

  // Internal notes
  const { data: internalNotes = [] } = useQuery({
    queryKey: ["internal-notes", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const { data, error } = await supabase
        .from("internal_notes")
        .select("*")
        .eq("conversation_id", selectedConversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConversationId,
  });

  // Departments
  const { data: departments = [] } = useQuery({
    queryKey: ["departments", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("departments").select("*").eq("tenant_id", tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // --- Tab title badge ---
  useEffect(() => {
    if (unreadBadge > 0) {
      let toggle = true;
      titleIntervalRef.current = setInterval(() => {
        document.title = toggle
          ? `💬 (${unreadBadge}) Nova${unreadBadge > 1 ? "s" : ""} mensagem${unreadBadge > 1 ? "ns" : ""}`
          : originalTitleRef.current;
        toggle = !toggle;
      }, 1200);
    } else {
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
      document.title = originalTitleRef.current;
    }
    return () => { if (titleIntervalRef.current) clearInterval(titleIntervalRef.current); };
  }, [unreadBadge]);

  useEffect(() => {
    const onFocus = () => setUnreadBadge(0);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`inbox-realtime-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["inbox-metrics"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["inbox-metrics"] });
          const newMsg = payload.new;
          const convId = newMsg?.conversation_id || payload.old?.conversation_id;
          const isIncoming = newMsg?.direction === "incoming" && newMsg?.role === "contact";
          if (isIncoming) {
            const isCurrentConv = convId === selectedConversationId;
            if (!isCurrentConv || !document.hasFocus()) {
              playNotificationSound();
              setUnreadBadge((prev) => prev + 1);
            }
          }
          if (selectedConversationId && convId === selectedConversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_notes" },
        (payload: any) => {
          const convId = payload.new?.conversation_id || payload.old?.conversation_id;
          if (!convId || convId === selectedConversationId) {
            queryClient.invalidateQueries({ queryKey: ["internal-notes", selectedConversationId] });
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["conversations"] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, selectedConversationId, queryClient]);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setInputTab("message");
    setMessageInput("");
    setUnreadBadge(0);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConv = conversations.find((c: any) => c.id === selectedConversationId);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversationId || !messageInput.trim()) return;
      if (inputTab === "internal") {
        const { error } = await supabase.from("internal_notes").insert({
          tenant_id: tenantId, conversation_id: selectedConversationId,
          user_id: user?.id, note_text: messageInput.trim(),
        });
        if (error) throw error;
      } else {
        await sendMessage({ conversationId: selectedConversationId, content: messageInput });
      }
    },
    onSuccess: () => {
      setMessageInput("");
      inputRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      if (inputTab === "internal") queryClient.invalidateQueries({ queryKey: ["internal-notes", selectedConversationId] });
    },
    onError: (e: any) => toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" }),
  });

  const suggestAI = useCallback(async () => {
    if (!selectedConversationId) return;
    setAiSuggesting(true);
    try {
      await sendMessage({
        conversationId: selectedConversationId,
        content: "Sugira uma resposta baseada no contexto desta conversa.",
        mode: "suggest",
      });
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      toast({ title: "Sugestão da IA gerada" });
    } catch (e: any) {
      toast({ title: "Erro na sugestão", description: e.message, variant: "destructive" });
    } finally { setAiSuggesting(false); }
  }, [selectedConversationId, queryClient, toast]);

  const toggleAi = useMutation({
    mutationFn: async (conv: any) => {
      const { error } = await supabase.from("conversations").update({ ai_paused: !conv.ai_paused }).eq("id", conv.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const assignToMe = useMutation({
    mutationFn: async (convId: string) => {
      const { error } = await supabase.from("conversations").update({ assigned_agent_id: user?.id }).eq("id", convId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa atribuída a você!" });
    },
  });

  // Group messages by date
  const groupedMessages = messages.reduce((acc: any[], msg: any) => {
    const date = new Date(msg.created_at).toLocaleDateString("pt-BR");
    const last = acc[acc.length - 1];
    if (!last || last.date !== date) acc.push({ type: "separator", date, id: `sep-${date}` });
    acc.push({ type: "message", ...msg });
    return acc;
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden rounded-xl border border-border">
      {/* Sidebar */}
      <div className="w-80 flex flex-col border-r border-border bg-card flex-shrink-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Inbox</h2>
            <Badge variant="secondary" className="text-xs">
              {totalCount} conversa{totalCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="destructive" className="text-[10px]">{inboxMetrics.unread} não lidas</Badge>
            <Badge variant="outline" className="text-[10px]">{inboxMetrics.awaiting} aguardando</Badge>
            <Badge variant="secondary" className="text-[10px]">{inboxMetrics.answered} respondidas</Badge>
          </div>
        </div>
        {convsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            userId={user?.id}
            page={page}
            onPageChange={setPage}
            totalCount={totalCount}
            departments={departments}
            salesStatusFilter={salesStatusFilter}
            onSalesStatusChange={setSalesStatusFilter}
            departmentFilter={departmentFilter}
            onDepartmentChange={setDepartmentFilter}
          />
        )}
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col bg-card min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <MessageSquare className="h-14 w-14 mx-auto opacity-30" />
              <div>
                <p className="font-medium">Selecione uma conversa</p>
                <p className="text-sm text-muted-foreground mt-1">Escolha uma conversa na lista à esquerda</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedConv.contacts?.avatar_url ? (
                    <img src={selectedConv.contacts.avatar_url} alt={selectedConv.contacts?.name || ""}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                  ) : null}
                  <div className={cn(
                    "w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0",
                    selectedConv.contacts?.avatar_url ? "hidden" : ""
                  )}>
                    {(selectedConv.contacts?.name || selectedConv.contacts?.phone || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">
                        {selectedConv.contacts?.name || selectedConv.contacts?.phone}
                      </h3>
                      <Badge variant={selectedConv.status === "open" ? "default" : "secondary"} className="text-xs h-4 py-0">
                        {selectedConv.status}
                      </Badge>
                      {selectedConv.ai_paused ? (
                        <Badge variant="outline" className="text-xs h-4 py-0">IA pausada</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs h-4 py-0 border-primary/40 text-primary">IA ativa</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedConv.contacts?.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => assignToMe.mutate(selectedConv.id)}>
                    <UserCheck className="h-3 w-3 mr-1" />Assumir
                  </Button>
                  <Button variant={selectedConv.ai_paused ? "default" : "outline"} size="sm" className="h-7 text-xs px-2"
                    onClick={() => toggleAi.mutate(selectedConv)}>
                    {selectedConv.ai_paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                    {selectedConv.ai_paused ? "Retomar IA" : "Pausar IA"}
                  </Button>
                  <ActionMenu conversation={selectedConv} departments={departments} tenantId={tenantId!} />
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {msgsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : groupedMessages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-4xl mx-auto">
                  {groupedMessages.map((item: any) =>
                    item.type === "separator" ? (
                      <div key={item.id} className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground px-2">{item.date}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    ) : (
                      <MessageBubble key={item.id} message={item} />
                    )
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border bg-card p-3">
              <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as "message" | "internal")}>
                <TabsList className="h-7 mb-2">
                  <TabsTrigger value="message" className="text-xs h-6">
                    <MessageSquare className="h-3 w-3 mr-1" />Mensagem
                  </TabsTrigger>
                  <TabsTrigger value="internal" className="text-xs h-6">
                    <Bot className="h-3 w-3 mr-1" />Nota Interna
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="message" className="mt-0">
                  <div className="flex gap-2 items-center">
                    <ActionMenu conversation={selectedConv} departments={departments} tenantId={tenantId!} />
                    <Input ref={inputRef} value={messageInput} onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Digite sua mensagem..." className="flex-1 h-9"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMutation.mutate()} />
                    <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={suggestAI}
                      disabled={aiSuggesting} title="Sugerir resposta com IA">
                      {aiSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => sendMutation.mutate()}
                      disabled={!messageInput.trim() || sendMutation.isPending}>
                      {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="internal" className="mt-0">
                  <InternalNotes conversationId={selectedConversationId!} tenantId={tenantId!} notes={internalNotes} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Inbox;
