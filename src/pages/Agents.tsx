import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus,
  Search,
  Filter,
  Users,
  MessageSquare,
  Clock,
  Star,
  Edit,
  Trash2,
  Eye,
  Phone,
  Mail,
  Calendar
} from "lucide-react";

const Agents = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const agents = [
    {
      id: "1",
      name: "Maria Santos",
      email: "maria.santos@empresa.com",
      phone: "(11) 99999-1234",
      sector: "Suporte Técnico",
      status: "online",
      totalChats: 156,
      avgResponseTime: "2.1 min",
      satisfaction: 4.8,
      joinDate: "15/01/2024",
      lastActivity: "Ativo agora"
    },
    {
      id: "2",
      name: "Pedro Lima",
      email: "pedro.lima@empresa.com",
      phone: "(11) 99999-5678",
      sector: "Vendas",
      status: "online",
      totalChats: 203,
      avgResponseTime: "1.5 min",
      satisfaction: 4.9,
      joinDate: "10/12/2023",
      lastActivity: "Ativo agora"
    },
    {
      id: "3",
      name: "Ana Costa",
      email: "ana.costa@empresa.com",
      phone: "(11) 99999-9101",
      sector: "Financeiro",
      status: "busy",
      totalChats: 89,
      avgResponseTime: "3.2 min",
      satisfaction: 4.6,
      joinDate: "22/03/2024",
      lastActivity: "5 min atrás"
    },
    {
      id: "4",
      name: "Carlos Mendes",
      email: "carlos.mendes@empresa.com",
      phone: "(11) 99999-1213",
      sector: "Suporte Técnico",
      status: "offline",
      totalChats: 134,
      avgResponseTime: "2.8 min",
      satisfaction: 4.7,
      joinDate: "05/02/2024",
      lastActivity: "2 horas atrás"
    },
    {
      id: "5",
      name: "Lucia Ferreira",
      email: "lucia.ferreira@empresa.com",
      phone: "(11) 99999-1415",
      sector: "Recursos Humanos",
      status: "online",
      totalChats: 67,
      avgResponseTime: "4.1 min",
      satisfaction: 4.5,
      joinDate: "18/01/2024",
      lastActivity: "Ativo agora"
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
      case "busy":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Ocupado</Badge>;
      case "offline":
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Offline</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSectorBadge = (sector: string) => {
    const colors = {
      "Suporte Técnico": "bg-blue-500/10 text-blue-500 border-blue-500/20",
      "Vendas": "bg-green-500/10 text-green-500 border-green-500/20",
      "Financeiro": "bg-purple-500/10 text-purple-500 border-purple-500/20",
      "Recursos Humanos": "bg-orange-500/10 text-orange-500 border-orange-500/20"
    };
    return (
      <Badge className={colors[sector as keyof typeof colors] || "bg-primary/10 text-primary border-primary/20"}>
        {sector}
      </Badge>
    );
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || agent.status === statusFilter;
    const matchesSector = sectorFilter === "all" || agent.sector === sectorFilter;
    return matchesSearch && matchesStatus && matchesSector;
  });

  const handleCreateAgent = () => {
    toast({
      title: "Atendente criado com sucesso!",
      description: "O novo atendente foi adicionado ao sistema.",
    });
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Atendentes</h1>
          <p className="text-muted-foreground">
            Administre sua equipe de atendimento WhatsApp
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Atendente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Atendente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-name">Nome Completo</Label>
                <Input id="agent-name" placeholder="Digite o nome completo" />
              </div>
              <div>
                <Label htmlFor="agent-email">E-mail</Label>
                <Input id="agent-email" type="email" placeholder="email@empresa.com" />
              </div>
              <div>
                <Label htmlFor="agent-phone">Telefone</Label>
                <Input id="agent-phone" placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label htmlFor="agent-sector">Setor</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suporte">Suporte Técnico</SelectItem>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="rh">Recursos Humanos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateAgent} className="w-full">
                Criar Atendente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar atendentes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="busy">Ocupado</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="w-full md:w-48">
              <Users className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Setores</SelectItem>
              <SelectItem value="Suporte Técnico">Suporte Técnico</SelectItem>
              <SelectItem value="Vendas">Vendas</SelectItem>
              <SelectItem value="Financeiro">Financeiro</SelectItem>
              <SelectItem value="Recursos Humanos">Recursos Humanos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Agents List */}
      <div className="grid gap-4">
        {filteredAgents.map((agent) => (
          <Card key={agent.id} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {agent.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{agent.name}</h3>
                    {getStatusBadge(agent.status)}
                    {getSectorBadge(agent.sector)}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{agent.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{agent.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>{agent.totalChats} conversas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Resp: {agent.avgResponseTime}</span>
                    </div>
                  </div>
                  
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{agent.satisfaction}/5.0</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Desde: {agent.joinDate}</span>
                    </div>
                    <span>• {agent.lastActivity}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredAgents.length === 0 && (
        <Card className="p-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum atendente encontrado</h3>
          <p className="text-muted-foreground">
            Não há atendentes que correspondam aos filtros aplicados.
          </p>
        </Card>
      )}
    </div>
  );
};

export default Agents;