import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, User, Bot, Pause, Play, UserCheck, MessageSquare } from "lucide-react";

const Inbox = () => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(name, phone)")
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
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

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, selectedConversationId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversationId || !messageInput.trim()) return;
      if (isInternal) {
        const { error } = await supabase.from("messages").insert({
          conversation_id: selectedConversationId,
          content: messageInput,
          role: "agent",
          is_internal: true,
          author_id: user?.id,
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
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
    },
    onError: (e: any) => toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" }),
  });

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

  const selectedConv = conversations.find((c: any) => c.id === selectedConversationId);

  const roleIcon = (role: string) => {
    if (role === "contact") return <User className="h-3 w-3" />;
    if (role === "ai") return <Bot className="h-3 w-3" />;
    return <UserCheck className="h-3 w-3" />;
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation List */}
      <Card className="w-80 flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-semibold text-sm">Conversas</h2>
        </div>
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma conversa</p>
          ) : (
            conversations.map((conv: any) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversationId(conv.id)}
                className={`p-3 border-b border-border cursor-pointer hover:bg-muted/50 transition ${selectedConversationId === conv.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{conv.contacts?.name || conv.contacts?.phone || "Desconhecido"}</span>
                  {conv.unread_count > 0 && <Badge variant="default" className="text-xs">{conv.unread_count}</Badge>}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs">{conv.status}</Badge>
                  {conv.ai_paused && <Badge variant="destructive" className="text-xs">IA Pausada</Badge>}
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </Card>

      {/* Chat Panel */}
      <Card className="flex-1 flex flex-col">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedConv.contacts?.name || selectedConv.contacts?.phone}</h3>
                <p className="text-xs text-muted-foreground">{selectedConv.contacts?.phone}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => assignToMe.mutate(selectedConv.id)}>
                  <UserCheck className="h-3 w-3 mr-1" />Assumir
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleAi.mutate(selectedConv)}>
                  {selectedConv.ai_paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                  {selectedConv.ai_paused ? "Retomar IA" : "Pausar IA"}
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.role === "contact" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[70%] rounded-lg p-3 text-sm ${
                      msg.is_internal ? "bg-yellow-500/20 border border-yellow-500/30" :
                      msg.role === "contact" ? "bg-muted" :
                      msg.role === "ai" ? "bg-primary/20" :
                      "bg-primary text-primary-foreground"
                    }`}>
                      <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
                        {roleIcon(msg.role)}
                        <span>{msg.role === "contact" ? "Cliente" : msg.role === "ai" ? "IA" : "Agente"}</span>
                        {msg.is_internal && <Badge variant="outline" className="text-xs ml-1">Nota Interna</Badge>}
                      </div>
                      <p>{msg.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <Button variant={isInternal ? "default" : "outline"} size="sm" onClick={() => setIsInternal(!isInternal)}>
                  {isInternal ? "📝 Nota Interna" : "💬 Mensagem"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={isInternal ? "Escreva uma nota interna..." : "Digite sua mensagem..."}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMutation.mutate()}
                />
                <Button onClick={() => sendMutation.mutate()} disabled={!messageInput.trim() || sendMutation.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default Inbox;
