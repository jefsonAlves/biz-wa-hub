import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Users, 
  Phone, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3
} from "lucide-react";
import { getCurrentUser, User as AuthUser } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate("/login");
      return;
    }
    setCurrentUser(user);
  }, [navigate]);

  if (!currentUser) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  // Mock data - será substituído por dados reais
  const stats = [
    {
      title: "Mensagens Hoje",
      value: "1,234",
      change: "+12%",
      icon: MessageSquare,
      trend: "up"
    },
    {
      title: "Atendentes Online",
      value: "8/12",
      change: "67%",
      icon: Users,
      trend: "stable"
    },
    {
      title: "Números WhatsApp",
      value: "3",
      change: "Ativos",
      icon: Phone,
      trend: "up"
    },
    {
      title: "Tempo Médio Resposta",
      value: "2.3min",
      change: "-18%",
      icon: Clock,
      trend: "up"
    }
  ];

  const recentChats = [
    {
      id: 1,
      client: "João Silva",
      sector: "Suporte",
      agent: "Maria Santos",
      lastMessage: "Preciso de ajuda com meu pedido #1234",
      time: "2 min",
      status: "active"
    },
    {
      id: 2,
      client: "Ana Costa",
      sector: "Vendas",
      agent: "Pedro Lima",
      lastMessage: "Gostaria de saber sobre os preços dos planos",
      time: "5 min",
      status: "waiting"
    },
    {
      id: 3,
      client: "Carlos Mendes",
      sector: "Financeiro",
      agent: "Lucia Ferreira",
      lastMessage: "Quando será processado meu reembolso?",
      time: "12 min",
      status: "resolved"
    }
  ];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do seu sistema de atendimento WhatsApp
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="bg-gradient-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs ${
                stat.trend === 'up' ? 'text-green-500' : 
                stat.trend === 'down' ? 'text-red-500' : 
                'text-muted-foreground'
              }`}>
                {stat.change} desde ontem
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Chats */}
        <Card className="lg:col-span-2 bg-gradient-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Conversas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentChats.map((chat) => (
                <div key={chat.id} className="flex items-center justify-between p-4 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{chat.client}</span>
                      <Badge variant="outline" className="text-xs">
                        {chat.sector}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {chat.lastMessage}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Atendente: {chat.agent} • {chat.time} atrás
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(chat.status)}
                    <Button size="sm" variant="ghost">
                      Ver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-gradient-card border-border/50">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" variant="outline">
              <Users className="mr-2 h-4 w-4" />
              Adicionar Atendente
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Phone className="mr-2 h-4 w-4" />
              Conectar WhatsApp
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Ver Relatórios
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Gerenciar Setores
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart Placeholder */}
      <Card className="bg-gradient-card border-border/50">
        <CardHeader>
          <CardTitle>Performance de Atendimento - Últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground border border-dashed border-border/50 rounded-lg">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-primary" />
              <p>Gráfico de performance será exibido aqui</p>
              <p className="text-sm">Dados em tempo real de mensagens, respostas e satisfação</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;