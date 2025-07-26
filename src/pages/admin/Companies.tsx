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
  Building2,
  Search,
  Filter,
  Plus,
  Settings,
  BarChart3,
  Users,
  Phone,
  DollarSign,
  Edit,
  Trash2,
  Eye
} from "lucide-react";

const Companies = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const companies = [
    {
      id: "1",
      name: "TechSolutions LTDA",
      email: "contato@techsolutions.com",
      plan: "Premium",
      employees: 25,
      status: "Ativa",
      whatsappNumbers: 3,
      monthlyRevenue: "R$ 2.450",
      createdAt: "15/03/2024",
      lastActivity: "2 horas atrás"
    },
    {
      id: "2",
      name: "Vendas & Marketing Corp",
      email: "admin@vendasmarketing.com", 
      plan: "Professional",
      employees: 18,
      status: "Ativa",
      whatsappNumbers: 2,
      monthlyRevenue: "R$ 1.890",
      createdAt: "22/02/2024",
      lastActivity: "1 dia atrás"
    },
    {
      id: "3",
      name: "StartupFlow",
      email: "hello@startupflow.com",
      plan: "Basic",
      employees: 8,
      status: "Pendente",
      whatsappNumbers: 1,
      monthlyRevenue: "R$ 587",
      createdAt: "08/04/2024",
      lastActivity: "3 dias atrás"
    },
    {
      id: "4",
      name: "Inovação Digital",
      email: "contato@inovacaodigital.com",
      plan: "Premium",
      employees: 32,
      status: "Suspensa",
      whatsappNumbers: 4,
      monthlyRevenue: "R$ 2.450",
      createdAt: "12/01/2024",
      lastActivity: "1 semana atrás"
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

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || company.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateCompany = () => {
    toast({
      title: "Empresa criada com sucesso!",
      description: "A nova empresa foi adicionada ao sistema.",
    });
    setIsCreateModalOpen(false);
  };

  const handleEditCompany = (companyId: string) => {
    toast({
      title: "Editando empresa",
      description: `Abrindo formulário para editar empresa ID: ${companyId}`,
    });
  };

  const handleDeleteCompany = (companyId: string) => {
    toast({
      title: "Empresa removida",
      description: "A empresa foi removida do sistema.",
      variant: "destructive"
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Empresas</h1>
          <p className="text-muted-foreground">
            Administre todas as empresas cadastradas no sistema
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="company-name">Nome da Empresa</Label>
                <Input id="company-name" placeholder="Digite o nome da empresa" />
              </div>
              <div>
                <Label htmlFor="company-email">E-mail</Label>
                <Input id="company-email" type="email" placeholder="contato@empresa.com" />
              </div>
              <div>
                <Label htmlFor="company-plan">Plano</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic - R$ 587</SelectItem>
                    <SelectItem value="professional">Professional - R$ 879</SelectItem>
                    <SelectItem value="premium">Premium - R$ 977</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="max-employees">Máximo de Funcionários</Label>
                <Input id="max-employees" type="number" placeholder="50" />
              </div>
              <Button onClick={handleCreateCompany} className="w-full">
                Criar Empresa
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
                placeholder="Buscar empresas..."
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
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="suspensa">Suspensa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Companies List */}
      <div className="grid gap-4">
        {filteredCompanies.map((company) => (
          <Card key={company.id} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">{company.name}</h3>
                  {getStatusBadge(company.status)}
                  {getPlanBadge(company.plan)}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{company.employees} funcionários</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{company.whatsappNumbers} números WhatsApp</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <span>{company.monthlyRevenue}/mês</span>
                  </div>
                  <div>
                    <span>Última atividade: {company.lastActivity}</span>
                  </div>
                </div>
                
                <div className="mt-2 text-sm text-muted-foreground">
                  <span>E-mail: {company.email} • Criada em: {company.createdAt}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleEditCompany(company.id)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleEditCompany(company.id)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost">
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost">
                  <Settings className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => handleDeleteCompany(company.id)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredCompanies.length === 0 && (
        <Card className="p-8 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma empresa encontrada</h3>
          <p className="text-muted-foreground">
            Não há empresas que correspondam aos filtros aplicados.
          </p>
        </Card>
      )}
    </div>
  );
};

export default Companies;