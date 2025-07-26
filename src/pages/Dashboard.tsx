import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Activity,
  Phone,
  Bot,
  CheckCircle,
  AlertCircle
} from "lucide-react";

const Dashboard = () => {
  const stats = [
    {
      title: "Conversas Hoje",
      value: "47",
      change: "+12%",
      trend: "up",
      icon: MessageSquare,
      color: "text-primary"
    },
    {
      title: "Atendentes Online",
      value: "8/12",
      change: "67% ativo",
      trend: "up",
      icon: Users,
      color: "text-green-500"
    },
    {
      title: "Tempo Médio Resposta",
      value: "2m 34s",
      change: "-15%",
      trend: "down",
      icon: Clock,
      color: "text-blue-500"
    },
    {
      title: "Taxa de Resolução",
      value: "94%",
      change: "+3%",
      trend: "up",
      icon: CheckCircle,
      color: "text-emerald-500"
    }
  ];

  const recentChats = [
    {
      id: "1",
      customer: "João Silva",
      phone: "+55 11 99999-9999",
      department: "Vendas",
      agent: "Maria - Vendas",
      status: "Ativo",
      lastMessage: "Preciso de informações sobre o produto X",
      time: "2 min atrás"
    },
    {
      id: "2",
      customer: "Ana Costa",
      phone: "+55 11 88888-8888",
      department: "Suporte",
      agent: "Carlos - Suporte",
      status: "Pendente",
      lastMessage: "O sistema não está funcionando",
      time: "5 min atrás"
    },
    {
      id: "3",
      customer: "Pedro Santos",
      phone: "+55 11 77777-7777",
      department: "Financeiro",
      agent: "Bot Financeiro",
      status: "Bot",
      lastMessage: "Qual o status do meu pagamento?",
      time: "8 min atrás"
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Ativo":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativo</Badge>;
      case "Pendente":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      case "Bot":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Bot</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral dos atendimentos e performance da equipe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <Activity className="h-3 w-3 mr-1" />
            Sistema Online
          </Badge>
          <Button variant="hero">
            <Phone className="h-4 w-4 mr-2" />
            Novo Atendimento
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp 
                    className={`h-3 w-3 ${
                      stat.trend === 'up' ? 'text-green-500' : 'text-red-500'
                    } ${stat.trend === 'down' ? 'rotate-180' : ''}`} 
                  />
                  <span className={`text-xs font-medium ${
                    stat.trend === 'up' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {stat.change}
                  </span>
                </div>
              </div>
              <div className={`p-3 rounded-full bg-muted/20`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Conversas Recentes */}
        <Card className="lg:col-span-2 p-6 bg-gradient-card border-border/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Conversas Recentes</h3>
            <Button variant="ghost" size="sm">
              Ver todas
            </Button>
          </div>
          
          <div className="space-y-4">
            {recentChats.map((chat) => (
              <div key={chat.id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{chat.customer}</h4>
                    {getStatusBadge(chat.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {chat.lastMessage}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{chat.agent}</span>
                    <span>•</span>
                    <span>{chat.department}</span>
                    <span>•</span>
                    <span>{chat.time}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-6 bg-gradient-card border-border/50">
          <h3 className="text-xl font-semibold mb-6">Ações Rápidas</h3>
          
          <div className="space-y-3">
            <Button className="w-full justify-start" variant="ghost">
              <MessageSquare className="h-4 w-4 mr-3" />
              Iniciar Atendimento
            </Button>
            <Button className="w-full justify-start" variant="ghost">
              <Users className="h-4 w-4 mr-3" />
              Gerenciar Equipe
            </Button>
            <Button className="w-full justify-start" variant="ghost">
              <Bot className="h-4 w-4 mr-3" />
              Configurar Bot
            </Button>
            <Button className="w-full justify-start" variant="ghost">
              <BarChart3 className="h-4 w-4 mr-3" />
              Ver Relatórios
            </Button>
          </div>

          <div className="mt-6 p-4 bg-muted/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Dica do Dia</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure mensagens automáticas para horários fora do expediente para melhorar a experiência do cliente.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;