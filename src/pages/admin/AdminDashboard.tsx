import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Building2,
  Users,
  Phone,
  Settings,
  DollarSign,
  Headphones,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus
} from "lucide-react";

const AdminDashboard = () => {
  const globalStats = [
    {
      title: "Empresas Ativas",
      value: "24",
      change: "+3 este mês",
      trend: "up",
      icon: Building2,
      color: "text-blue-500"
    },
    {
      title: "Total de Funcionários",
      value: "347",
      change: "+15 este mês",
      trend: "up",
      icon: Users,
      color: "text-green-500"
    },
    {
      title: "Números WhatsApp",
      value: "89",
      change: "12 pendentes",
      trend: "warning",
      icon: Phone,
      color: "text-purple-500"
    },
    {
      title: "Receita Mensal",
      value: "R$ 45.780",
      change: "+18% vs mês anterior",
      trend: "up",
      icon: DollarSign,
      color: "text-emerald-500"
    }
  ];

  const recentCompanies = [
    {
      id: "1",
      name: "TechSolutions LTDA",
      plan: "Premium",
      employees: 25,
      status: "Ativa",
      lastActivity: "2 horas atrás",
      revenue: "R$ 2.450"
    },
    {
      id: "2", 
      name: "Vendas & Marketing Corp",
      plan: "Professional",
      employees: 18,
      status: "Pendente",
      lastActivity: "1 dia atrás",
      revenue: "R$ 1.890"
    },
    {
      id: "3",
      name: "StartupFlow",
      plan: "Basic",
      employees: 8,
      status: "Ativa",
      lastActivity: "30 min atrás",
      revenue: "R$ 587"
    }
  ];

  const supportTickets = [
    {
      id: "1",
      company: "TechSolutions LTDA",
      issue: "Problema de integração WhatsApp",
      priority: "Alta",
      status: "Aberto",
      time: "2h atrás"
    },
    {
      id: "2",
      company: "Vendas & Marketing",
      issue: "Solicitação de novos usuários",
      priority: "Média",
      status: "Em andamento",
      time: "4h atrás"
    },
    {
      id: "3",
      company: "StartupFlow",
      issue: "Dúvida sobre relatórios",
      priority: "Baixa",
      status: "Resolvido",
      time: "1 dia atrás"
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Ativa":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativa</Badge>;
      case "Pendente":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      case "Suspensa":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Suspensa</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "Alta":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Alta</Badge>;
      case "Média":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Média</Badge>;
      case "Baixa":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Baixa</Badge>;
      default:
        return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  const getTicketStatusBadge = (status: string) => {
    switch (status) {
      case "Aberto":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Aberto</Badge>;
      case "Em andamento":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Em andamento</Badge>;
      case "Resolvido":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Resolvido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Administrativo</h1>
          <p className="text-muted-foreground">
            Painel de controle do administrador master - Jefson
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Sistema Operacional
          </Badge>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nova Empresa
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {globalStats.map((stat, index) => (
          <Card key={index} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {stat.change}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-full bg-muted/20">
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Empresas Recentes */}
        <Card className="lg:col-span-2 p-6 bg-gradient-card border-border/50">
          <CardHeader className="p-0 mb-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Empresas Recentes</CardTitle>
              <Button variant="ghost" size="sm">
                Ver todas
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <div className="space-y-4">
              {recentCompanies.map((company) => (
                <div key={company.id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{company.name}</h4>
                      {getStatusBadge(company.status)}
                      <Badge variant="outline" className="text-xs">
                        {company.plan}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{company.employees} funcionários</span>
                      <span>•</span>
                      <span>{company.revenue}/mês</span>
                      <span>•</span>
                      <span>{company.lastActivity}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Chamados de Suporte */}
        <Card className="p-6 bg-gradient-card border-border/50">
          <CardHeader className="p-0 mb-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Suporte</CardTitle>
              <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                3 Abertos
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <div className="space-y-3">
              {supportTickets.map((ticket) => (
                <div key={ticket.id} className="p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    {getPriorityBadge(ticket.priority)}
                    {getTicketStatusBadge(ticket.status)}
                  </div>
                  <h5 className="font-medium text-sm mb-1">{ticket.issue}</h5>
                  <p className="text-xs text-muted-foreground mb-1">{ticket.company}</p>
                  <p className="text-xs text-muted-foreground">{ticket.time}</p>
                </div>
              ))}
            </div>
            
            <Button className="w-full mt-4" variant="ghost">
              <Headphones className="h-4 w-4 mr-2" />
              Ver Todos os Chamados
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - Master Admin */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <CardHeader className="p-0 mb-6">
          <CardTitle className="text-xl">Ações do Administrador Master</CardTitle>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <Building2 className="h-6 w-6" />
              <span className="text-xs">Cadastrar Empresa</span>
            </Button>
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <Users className="h-6 w-6" />
              <span className="text-xs">Gerenciar Usuários</span>
            </Button>
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <Phone className="h-6 w-6" />
              <span className="text-xs">Números WhatsApp</span>
            </Button>
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <DollarSign className="h-6 w-6" />
              <span className="text-xs">Cobranças</span>
            </Button>
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <BarChart3 className="h-6 w-6" />
              <span className="text-xs">Relatórios</span>
            </Button>
            <Button className="flex flex-col h-20 gap-2" variant="ghost">
              <Settings className="h-6 w-6" />
              <span className="text-xs">Configurações</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;