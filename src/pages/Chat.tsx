import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  Search,
  Filter,
  Phone,
  MoreVertical,
  Clock,
  Check,
  CheckCheck,
  Paperclip,
  Smile
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Chat = () => {
  const { toast } = useToast();
  const [selectedChat, setSelectedChat] = useState("1");
  const [newMessage, setNewMessage] = useState("");
  
  // Simulando dados sincronizados com o Dashboard
  const departments = [
    { id: '1', name: 'Suporte', description: 'Atendimento técnico' },
    { id: '2', name: 'Vendas', description: 'Vendas e negociação' },
    { id: '3', name: 'Financeiro', description: 'Questões financeiras' }
  ];
  
  const employees = [
    { id: '1', name: 'Maria Santos', email: 'maria@empresa.com', phone: '+55 11 99999-0001', departmentId: '1' },
    { id: '2', name: 'Pedro Lima', email: 'pedro@empresa.com', phone: '+55 11 99999-0002', departmentId: '2' },
    { id: '3', name: 'Lucia Ferreira', email: 'lucia@empresa.com', phone: '+55 11 99999-0003', departmentId: '3' }
  ];

  const chats = [
    {
      id: "1",
      clientName: "João Silva",
      clientPhone: "+55 11 99999-1234",
      sector: "Suporte",
      agent: "Maria Santos",
      lastMessage: "Preciso de ajuda com meu pedido #1234",
      lastMessageTime: "14:32",
      unreadCount: 2,
      status: "active"
    },
    {
      id: "2",
      clientName: "Ana Costa",
      clientPhone: "+55 11 99999-5678",
      sector: "Vendas",
      agent: "Pedro Lima",
      lastMessage: "Gostaria de saber sobre os preços",
      lastMessageTime: "14:28",
      unreadCount: 0,
      status: "waiting"
    },
    {
      id: "3",
      clientName: "Carlos Mendes",
      clientPhone: "+55 11 99999-9101",
      sector: "Financeiro",
      agent: "Lucia Ferreira",
      lastMessage: "Quando será processado meu reembolso?",
      lastMessageTime: "14:15",
      unreadCount: 1,
      status: "resolved"
    }
  ];

  const messages = [
    {
      id: "1",
      sender: "client",
      content: "Olá, boa tarde!",
      time: "14:20",
      status: "read"
    },
    {
      id: "2",
      sender: "agent",
      content: "Olá! Aqui é a Maria | Suporte Técnico. Como posso te ajudar hoje?",
      time: "14:21",
      status: "read"
    },
    {
      id: "3",
      sender: "client",
      content: "Estou com problema no meu pedido #1234. Não consigo acessar o download.",
      time: "14:25",
      status: "read"
    },
    {
      id: "4",
      sender: "agent",
      content: "Entendi. Vou verificar seu pedido agora. Pode me confirmar o e-mail cadastrado?",
      time: "14:26",
      status: "read"
    },
    {
      id: "5",
      sender: "client",
      content: "joao.silva@email.com",
      time: "14:30",
      status: "read"
    },
    {
      id: "6",
      sender: "client",
      content: "Preciso de ajuda com meu pedido #1234",
      time: "14:32",
      status: "delivered"
    }
  ];

  const currentChat = chats.find(chat => chat.id === selectedChat);

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      // Aqui adicionaria a lógica para enviar mensagem
      const currentEmployee = employees.find(emp => emp.id === '1'); // Usuário atual (mockado)
      toast({
        title: "Mensagem enviada",
        description: `Mensagem enviada por ${currentEmployee?.name}`,
      });
      setNewMessage("");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativo</Badge>;
      case "waiting":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Aguardando</Badge>;
      case "resolved":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Resolvido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSectorColor = (sector: string) => {
    const colors = {
      "Suporte": "text-blue-500",
      "Vendas": "text-green-500",
      "Financeiro": "text-purple-500",
      "RH": "text-orange-500"
    };
    return colors[sector as keyof typeof colors] || "text-primary";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Conversas WhatsApp</h1>
        <p className="text-muted-foreground">
          Gerencie todos os atendimentos em tempo real
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
        {/* Chat List */}
        <div className="lg:col-span-1">
          <Card className="h-full bg-gradient-card border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Conversas</CardTitle>
                <Button size="sm" variant="ghost">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversas..."
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="space-y-1 p-3">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => setSelectedChat(chat.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedChat === chat.id 
                          ? 'bg-primary/10 border border-primary/20' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {chat.clientName.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium text-sm truncate">{chat.clientName}</h4>
                            <span className="text-xs text-muted-foreground">{chat.lastMessageTime}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-xs ${getSectorColor(chat.sector)}`}>
                              {chat.sector}
                            </Badge>
                            {chat.unreadCount > 0 && (
                              <Badge className="text-xs bg-primary">
                                {chat.unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {chat.lastMessage}
                          </p>
            <p className="text-xs font-medium text-primary mt-1">
              👤 {chat.agent}
            </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-3">
          <Card className="h-full bg-gradient-card border-border/50 flex flex-col">
            {currentChat ? (
              <>
                {/* Chat Header */}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {currentChat.clientName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{currentChat.clientName}</h3>
                          {getStatusBadge(currentChat.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{currentChat.clientPhone}</span>
                          <span>•</span>
                          <span className={getSectorColor(currentChat.sector)}>
                            {currentChat.sector}
                          </span>
                          <span>•</span>
                          <span className="font-medium text-primary">
                            👤 Atendente: {currentChat.agent}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <Separator />

                {/* Messages */}
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-[calc(100vh-400px)] p-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === 'agent' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className="flex flex-col">
                            {message.sender === 'agent' && (
                              <span className="text-xs text-primary font-medium mb-1 text-right">
                                👤 Maria Santos | Suporte
                              </span>
                            )}
                            <div
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                message.sender === 'agent'
                                  ? 'bg-primary text-primary-foreground ml-auto'
                                  : 'bg-muted'
                              }`}
                            >
                              <p className="text-sm">{message.content}</p>
                              <div className={`flex items-center gap-1 mt-1 ${
                                message.sender === 'agent' ? 'justify-end' : 'justify-start'
                              }`}>
                                <span className={`text-xs ${
                                  message.sender === 'agent' 
                                    ? 'text-primary-foreground/70' 
                                    : 'text-muted-foreground'
                                }`}>
                                  {message.time}
                                </span>
                                {message.sender === 'agent' && (
                                  <div className="text-primary-foreground/70">
                                    {message.status === 'read' ? (
                                      <CheckCheck className="h-3 w-3" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>

                <Separator />

                {/* Message Input */}
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Smile className="h-4 w-4" />
                    </Button>
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Selecione uma conversa</h3>
                  <p className="text-muted-foreground">
                    Escolha uma conversa da lista para começar o atendimento
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Chat;