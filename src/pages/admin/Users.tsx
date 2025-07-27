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
  Users,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Eye,
  Building2,
  Shield,
  UserCheck,
  Clock
} from "lucide-react";

const UsersPage = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const users = [
    {
      id: "1",
      name: "Jefson",
      email: "jefson.ti@gmail.com",
      type: "admin",
      company: "Sistema",
      department: "Administração",
      status: "Ativo",
      lastLogin: "Agora",
      createdAt: "01/01/2024",
      avatar: "J"
    },
    {
      id: "2", 
      name: "Maria Silva",
      email: "maria@techsolutions.com",
      type: "company",
      company: "TechSolutions LTDA",
      department: "Administração",
      status: "Ativo",
      lastLogin: "2 horas atrás",
      createdAt: "15/03/2024",
      avatar: "MS"
    },
    {
      id: "3",
      name: "João Santos",
      email: "joao@techsolutions.com", 
      type: "employee",
      company: "TechSolutions LTDA",
      department: "Vendas",
      status: "Ativo",
      lastLogin: "1 hora atrás",
      createdAt: "20/03/2024",
      avatar: "JS"
    },
    {
      id: "4",
      name: "Ana Costa",
      email: "ana@vendasmarketing.com",
      type: "company",
      company: "Vendas & Marketing Corp",
      department: "Administração",
      status: "Ativo", 
      lastLogin: "3 horas atrás",
      createdAt: "22/02/2024",
      avatar: "AC"
    },
    {
      id: "5",
      name: "Carlos Oliveira",
      email: "carlos@vendasmarketing.com",
      type: "employee",
      company: "Vendas & Marketing Corp",
      department: "Suporte",
      status: "Inativo",
      lastLogin: "2 dias atrás",
      createdAt: "01/03/2024",
      avatar: "CO"
    }
  ];

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "admin":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Admin Master</Badge>;
      case "company":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Empresa</Badge>;
      case "employee":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Funcionário</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Ativo":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativo</Badge>;
      case "Inativo":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Inativo</Badge>;
      case "Pendente":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "admin":
        return <Shield className="h-4 w-4" />;
      case "company":
        return <Building2 className="h-4 w-4" />;
      case "employee":
        return <UserCheck className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || user.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleCreateUser = () => {
    toast({
      title: "Usuário criado com sucesso!",
      description: "O novo usuário foi adicionado ao sistema.",
    });
    setIsCreateModalOpen(false);
  };

  const handleEditUser = (userId: string) => {
    toast({
      title: "Editando usuário",
      description: `Abrindo formulário para editar usuário ID: ${userId}`,
    });
  };

  const handleDeleteUser = (userId: string) => {
    toast({
      title: "Usuário removido",
      description: "O usuário foi removido do sistema.",
      variant: "destructive"
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>
          <p className="text-muted-foreground">
            Administre todos os usuários do sistema
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="user-name">Nome Completo</Label>
                <Input id="user-name" placeholder="Digite o nome completo" />
              </div>
              <div>
                <Label htmlFor="user-email">E-mail</Label>
                <Input id="user-email" type="email" placeholder="usuario@empresa.com" />
              </div>
              <div>
                <Label htmlFor="user-type">Tipo de Usuário</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin Master</SelectItem>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="employee">Funcionário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="user-company">Empresa</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">TechSolutions LTDA</SelectItem>
                    <SelectItem value="vendas">Vendas & Marketing Corp</SelectItem>
                    <SelectItem value="startup">StartupFlow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="user-password">Senha Temporária</Label>
                <Input id="user-password" type="password" placeholder="********" />
              </div>
              <Button onClick={handleCreateUser} className="w-full">
                Criar Usuário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">1</p>
              <p className="text-sm text-muted-foreground">Admin Master</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">24</p>
              <p className="text-sm text-muted-foreground">Empresas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <UserCheck className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">347</p>
              <p className="text-sm text-muted-foreground">Funcionários</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">23</p>
              <p className="text-sm text-muted-foreground">Online Agora</p>
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
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="admin">Admin Master</SelectItem>
              <SelectItem value="company">Empresa</SelectItem>
              <SelectItem value="employee">Funcionário</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Users List */}
      <div className="grid gap-4">
        {filteredUsers.map((user) => (
          <Card key={user.id} className="p-6 bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {user.avatar}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getTypeIcon(user.type)}
                    <h3 className="text-lg font-semibold">{user.name}</h3>
                    {getTypeBadge(user.type)}
                    {getStatusBadge(user.status)}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">E-mail:</span> {user.email}
                    </div>
                    <div>
                      <span className="font-medium">Empresa:</span> {user.company}
                    </div>
                    <div>
                      <span className="font-medium">Departamento:</span> {user.department}
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm text-muted-foreground">
                    <span>Último login: {user.lastLogin} • Criado em: {user.createdAt}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => {
                    toast({
                      title: "Visualizar usuário",
                      description: "Abrindo detalhes do usuário..."
                    });
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleEditUser(user.id)}>
                  <Edit className="h-4 w-4" />
                </Button>
                {user.type !== "admin" && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleDeleteUser(user.id)}
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

      {filteredUsers.length === 0 && (
        <Card className="p-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum usuário encontrado</h3>
          <p className="text-muted-foreground">
            Não há usuários que correspondam aos filtros aplicados.
          </p>
        </Card>
      )}
    </div>
  );
};

export default UsersPage;