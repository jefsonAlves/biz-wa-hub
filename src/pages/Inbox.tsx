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

const Inbox = () => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [inputTab, setInputTab] = useState<"message" | "internal">("message");
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Conversations
  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ["conversations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(name, phone, wa_chat_id, last_message_preview), departments(name)")
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Messages
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      // Reset unread count when opening conversation
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedConversationId);
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

  // Realtime subscription — ouve mudanças nas tabelas e invalida queries
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`inbox-realtime-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", tenantId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload: any) => {
          // Sempre atualiza a lista de conversas (last_message_at, unread_count)
          queryClient.invalidateQueries({ queryKey: ["conversations", tenantId] });
          // Atualiza mensagens da conversa aberta
          if (selectedConversationId) {
            const convId = payload.new?.conversation_id || payload.old?.conversation_id;
            if (!convId || convId === selectedConversationId) {
              queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_notes" },
        (payload: any) => {
          const convId = payload.new?.conversation_id || payload.old?.conversation_id;
          if (!convId || convId === selectedConversationId) {
            queryClient.invalidateQueries({ queryKey: ["internal-notes", selectedConversationId] });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", tenantId] });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Realtime Inbox: subscribed ✓");
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, selectedConversationId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConv = conversations.find((c: any) => c.id === selectedConversationId);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversationId || !messageInput.trim()) return;
      if (inputTab === "internal") {
        const { error } = await supabase.from("internal_notes").insert({
          tenant_id: tenantId,
          conversation_id: selectedConversationId,
          user_id: user?.id,
          note_text: messageInput.trim(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke("zapi-send", {
          body: { conversation_id: selectedConversationId, content: messageInput, type: "text" },
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setMessageInput("");
      inputRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      if (inputTab === "internal") {
        queryClient.invalidateQueries({ queryKey: ["internal-notes", selectedConversationId] });
      }
    },
    onError: (e: any) => toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" }),
  });

  const suggestAI = useCallback(async () => {
    if (!selectedConversationId) return;
    setAiSuggesting(true);
    try {
      const { error } = await supabase.functions.invoke("zapi-send", {
        body: {
          conversation_id: selectedConversationId,
          content: "Sugira uma resposta baseada no contexto desta conversa.",
          type: "text",
          mode: "suggest",
        },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      toast({ title: "Sugestão da IA gerada", description: "Verifique as mensagens com 'Sugestão IA'." });
    } catch (e: any) {
      toast({ title: "Erro na sugestão", description: e.message, variant: "destructive" });
    } finally {
      setAiSuggesting(false);
    }
  }, [selectedConversationId, queryClient, toast]);

  const toggleAi = useMutation({
    mutationFn: async (conv: any) => {
      const { error } = await supabase.from("conversations")
        .update({ ai_paused: !conv.ai_paused }).eq("id", conv.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations", tenantId] }),
  });

  const assignToMe = useMutation({
    mutationFn: async (convId: string) => {
      const { error } = await supabase.from("conversations")
        .update({ assigned_agent_id: user?.id }).eq("id", convId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", tenantId] });
      toast({ title: "Conversa atribuída a você!" });
    },
  });

  // Group messages by date for separators
  const groupedMessages = messages.reduce((acc: any[], msg: any) => {
    const date = new Date(msg.created_at).toLocaleDateString("pt-BR");
    const last = acc[acc.length - 1];
    if (!last || last.date !== date) {
      acc.push({ type: "separator", date, id: `sep-${date}` });
    }
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
              {conversations.filter((c: any) => c.unread_count > 0).length} novas
            </Badge>
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
            onSelect={(id) => {
              setSelectedConversationId(id);
              setInputTab("message");
              setMessageInput("");
            }}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            userId={user?.id}
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
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
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
                  <Button
                    variant={selectedConv.ai_paused ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => toggleAi.mutate(selectedConv)}
                  >
                    {selectedConv.ai_paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                    {selectedConv.ai_paused ? "Retomar IA" : "Pausar IA"}
                  </Button>
                  <ActionMenu
                    conversation={selectedConv}
                    departments={departments}
                    tenantId={tenantId!}
                  />
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {msgsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
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
                    <ActionMenu
                      conversation={selectedConv}
                      departments={departments}
                      tenantId={tenantId!}
                    />
                    <Input
                      ref={inputRef}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 h-9"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMutation.mutate()}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={suggestAI}
                      disabled={aiSuggesting}
                      title="Sugerir resposta com IA"
                    >
                      {aiSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => sendMutation.mutate()}
                      disabled={!messageInput.trim() || sendMutation.isPending}
                    >
                      {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="internal" className="mt-0">
                  <InternalNotes
                    conversationId={selectedConversationId!}
                    tenantId={tenantId!}
                    notes={internalNotes}
                  />
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
