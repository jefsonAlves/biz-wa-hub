import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Search,
  Filter,
  Plus,
  Settings,
  Edit,
  Trash2,
  Eye,
  Building2,
  CheckCircle,
  AlertTriangle,
  Clock,
  QrCode
} from "lucide-react";

const WhatsAppNumbers = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const whatsappNumbers = [
    {
      id: "1",
      number: "+55 11 99999-1234",
      displayName: "TechSolutions Atendimento",
      company: "TechSolutions LTDA",
      companyId: "tech1",
      status: "Ativo",
      connectedAt: "15/03/2024 14:30",
      lastActivity: "2 horas atrás",
      messagesCount: 1250,
      plan: "Premium",
      webhookUrl: "https://api.techsolutions.com/webhook"
    },
    {
      id: "2",
      number: "+55 11 88888-5678",
      displayName: "Vendas & Marketing",
      company: "Vendas & Marketing Corp",
      companyId: "vendas1",
      status: "Ativo",
      connectedAt: "22/02/2024 09:15",
      lastActivity: "1 hora atrás",
      messagesCount: 890,
      plan: "Professional",
      webhookUrl: "https://api.vendasmarketing.com/wh"
    },
    {
      id: "3",
      number: "+55 11 77777-9012",
      displayName: "StartupFlow Support",
      company: "StartupFlow",
      companyId: "startup1",
      status: "Pendente",
      connectedAt: "08/04/2024 16:45",
      lastActivity: "3 dias atrás",
      messagesCount: 156,
      plan: "Basic",
      webhookUrl: null
    },
    {
      id: "4",
      number: "+55 11 66666-3456",
      displayName: "Inovação Digital",
      company: "Inovação Digital",
      companyId: "inovacao1",
      status: "Desconectado",
      connectedAt: "12/01/2024 11:20",
      lastActivity: "1 semana atrás",
      messagesCount: 2340,
      plan: "Premium",
      webhookUrl: "https://api.inovacaodigital.com/webhook"
    },
    {
      id: "5",
      number: "+55 11 55555-7890",
      displayName: "Número Teste",
      company: "TechSolutions LTDA",
      companyId: "tech1",
      status: "Configurando",
      connectedAt: null,
      lastActivity: "Nunca",
      messagesCount: 0,
      plan: "Premium",
      webhookUrl: null
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Ativo":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Ativo
        </Badge>;
      case "Pendente":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>;
      case "Desconectado":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Desconectado
        </Badge>;
      case "Configurando":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
          <Settings className="h-3 w-3 mr-1" />
          Configurando
        </Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case "Premium":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Premium</Badge>;
      case "Professional":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Professional</Badge>;
      case "Basic":
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Basic</Badge>;
      default:
        return <Badge variant="secondary">{plan}</Badge>;
    }
  };

  const filteredNumbers = whatsappNumbers.filter(number => {
    const matchesSearch = number.number.includes(searchTerm) ||
                         number.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         number.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || number.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateNumber = () => {
    toast({
      title: "Número WhatsApp criado!",
      description: "O novo número foi adicionado ao sistema.",
    });
    setIsCreateModalOpen(false);
  };

  const handleGenerateQR = (numberId: string) => {
    toast({
      title: "QR Code gerado",
      description: "Escaneie o QR Code no WhatsApp para conectar o número.",
    });
  };

  const handleDisconnect = (numberId: string) => {
    toast({
      title: "Número desconectado",
      description: "O número WhatsApp foi desconectado com sucesso.",
      variant: "destructive"
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Números WhatsApp</h1>
          <p className="text-muted-foreground">
            Gerencie todas as conexões WhatsApp do sistema
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Número
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Número WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone-number">Número do Telefone</Label>
                <Input id="phone-number" placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <Label htmlFor="display-name">Nome de Exibição</Label>
                <Input id="display-name" placeholder="Atendimento Empresa" />
              </div>
              <div>
                <Label htmlFor="company-select">Empresa</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">TechSolutions LTDA</SelectItem>
                    <SelectItem value="vendas">Vendas & Marketing Corp</SelectItem>
                    <SelectItem value="startup">StartupFlow</SelectItem>
                    <SelectItem value="inovacao">Inovação Digital</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="webhook-url">URL do Webhook (Opcional)</Label>
                <Input id="webhook-url" placeholder="https://api.empresa.com/webhook" />
              </div>
              <Button onClick={handleCreateNumber} className="w-full">
                Adicionar Número
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">67</p>
              <p className="text-sm text-muted-foreground">Números Ativos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">8</p>
              <p className="text-sm text-muted-foreground">Desconectados</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Phone className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">89</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar números..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="desconectado">Desconectado</SelectItem>
              <SelectItem value="configurando">Configurando</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Numbers List */}
      <div className="grid gap-4">
        {filteredNumbers.map((number) => (
          <Card key={number.id} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">{number.number}</h3>
                  {getStatusBadge(number.status)}
                  {getPlanBadge(number.plan)}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-muted-foreground mb-3">
                  <div>
                    <span className="font-medium">Nome:</span> {number.displayName}
                  </div>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    <span>{number.company}</span>
                  </div>
                  <div>
                    <span className="font-medium">Mensagens:</span> {number.messagesCount.toLocaleString()}
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {number.connectedAt ? (
                    <span>Conectado em: {number.connectedAt} • Última atividade: {number.lastActivity}</span>
                  ) : (
                    <span>Aguardando conexão</span>
                  )}
                  {number.webhookUrl && (
                    <>
                      <span> • Webhook: {number.webhookUrl}</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {number.status === "Configurando" && (
                  <Button size="sm" variant="outline" onClick={() => handleGenerateQR(number.id)}>
                    <QrCode className="h-4 w-4 mr-1" />
                    QR Code
                  </Button>
                )}
                <Button size="sm" variant="ghost">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost">
                  <Settings className="h-4 w-4" />
                </Button>
                {number.status === "Ativo" && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleDisconnect(number.id)}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredNumbers.length === 0 && (
        <Card className="p-8 text-center">
          <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum número encontrado</h3>
          <p className="text-muted-foreground">
            Não há números WhatsApp que correspondam aos filtros aplicados.
          </p>
        </Card>
      )}
    </div>
  );
};

export default WhatsAppNumbers;