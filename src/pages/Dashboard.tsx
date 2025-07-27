import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MessageSquare, 
  Users, 
  Phone, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Plus,
  Trash2,
  Building2
} from "lucide-react";
import { getCurrentUser, User as AuthUser } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

// Tipos
interface Department {
  id: string;
  name: string;
  description: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  departmentId: string;
}

interface WhatsAppNumber {
  id: string;
  number: string;
  name: string;
  status: 'connected' | 'disconnected';
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  
  // Estados para gerenciamento
  const [departments, setDepartments] = useState<Department[]>([
    { id: '1', name: 'Suporte', description: 'Atendimento técnico' },
    { id: '2', name: 'Vendas', description: 'Vendas e negociação' },
    { id: '3', name: 'Financeiro', description: 'Questões financeiras' }
  ]);
  
  const [employees, setEmployees] = useState<Employee[]>([
    { id: '1', name: 'Maria Santos', email: 'maria@empresa.com', phone: '+55 11 99999-0001', departmentId: '1' },
    { id: '2', name: 'Pedro Lima', email: 'pedro@empresa.com', phone: '+55 11 99999-0002', departmentId: '2' },
    { id: '3', name: 'Lucia Ferreira', email: 'lucia@empresa.com', phone: '+55 11 99999-0003', departmentId: '3' }
  ]);
  
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([
    { id: '1', number: '+55 11 99999-1000', name: 'WhatsApp Principal', status: 'connected' },
    { id: '2', number: '+55 11 99999-2000', name: 'WhatsApp Vendas', status: 'disconnected' }
  ]);

  // Estados dos modais
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  
  // Estados dos formulários
  const [newDepartment, setNewDepartment] = useState({ name: '', description: '' });
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', phone: '', departmentId: '' });
  const [newWhatsApp, setNewWhatsApp] = useState({ number: '', name: '' });

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate("/login");
      return;
    }
    setCurrentUser(user);
  }, [navigate]);

  // Funções de gerenciamento
  const handleSaveDepartment = () => {
    if (newDepartment.name.trim()) {
      const department: Department = {
        id: Date.now().toString(),
        name: newDepartment.name,
        description: newDepartment.description
      };
      setDepartments([...departments, department]);
      setNewDepartment({ name: '', description: '' });
      setIsDepartmentModalOpen(false);
      toast({
        title: "Departamento criado",
        description: `${department.name} foi adicionado com sucesso.`,
      });
    }
  };

  const handleSaveEmployee = () => {
    if (newEmployee.name.trim() && newEmployee.email.trim() && newEmployee.departmentId) {
      const employee: Employee = {
        id: Date.now().toString(),
        name: newEmployee.name,
        email: newEmployee.email,
        phone: newEmployee.phone,
        departmentId: newEmployee.departmentId
      };
      setEmployees([...employees, employee]);
      setNewEmployee({ name: '', email: '', phone: '', departmentId: '' });
      setIsEmployeeModalOpen(false);
      toast({
        title: "Funcionário cadastrado",
        description: `${employee.name} foi adicionado com sucesso.`,
      });
    }
  };

  const handleSaveWhatsApp = () => {
    if (newWhatsApp.number.trim() && newWhatsApp.name.trim()) {
      const whatsapp: WhatsAppNumber = {
        id: Date.now().toString(),
        number: newWhatsApp.number,
        name: newWhatsApp.name,
        status: 'disconnected'
      };
      setWhatsappNumbers([...whatsappNumbers, whatsapp]);
      setNewWhatsApp({ number: '', name: '' });
      setIsWhatsAppModalOpen(false);
      toast({
        title: "WhatsApp adicionado",
        description: `${whatsapp.name} foi configurado com sucesso.`,
      });
    }
  };

  const handleDeleteDepartment = (id: string) => {
    setDepartments(departments.filter(dept => dept.id !== id));
    toast({
      title: "Departamento removido",
      description: "O departamento foi excluído com sucesso.",
    });
  };

  const handleDeleteEmployee = (id: string) => {
    setEmployees(employees.filter(emp => emp.id !== id));
    toast({
      title: "Funcionário removido",
      description: "O funcionário foi excluído com sucesso.",
    });
  };

  const getDepartmentName = (departmentId: string) => {
    return departments.find(dept => dept.id === departmentId)?.name || 'N/A';
  };

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

        {/* Management Actions */}
        <Card className="bg-gradient-card border-border/50">
          <CardHeader>
            <CardTitle>Gerenciamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* WhatsApp Button - Destacado */}
            <Dialog open={isWhatsAppModalOpen} onOpenChange={setIsWhatsAppModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full justify-start bg-green-600 hover:bg-green-700 text-white">
                  <Phone className="mr-2 h-4 w-4" />
                  Adicionar WhatsApp
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar WhatsApp para Monitoramento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="whatsapp-number">Número do WhatsApp</Label>
                    <Input
                      id="whatsapp-number"
                      placeholder="+55 11 99999-0000"
                      value={newWhatsApp.number}
                      onChange={(e) => setNewWhatsApp({...newWhatsApp, number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsapp-name">Nome/Identificação</Label>
                    <Input
                      id="whatsapp-name"
                      placeholder="WhatsApp Principal"
                      value={newWhatsApp.name}
                      onChange={(e) => setNewWhatsApp({...newWhatsApp, name: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveWhatsApp} className="flex-1">
                      Salvar
                    </Button>
                    <Button variant="outline" onClick={() => setIsWhatsAppModalOpen(false)} className="flex-1">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Department Button */}
            <Dialog open={isDepartmentModalOpen} onOpenChange={setIsDepartmentModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full justify-start" variant="outline">
                  <Building2 className="mr-2 h-4 w-4" />
                  Gerenciar Departamentos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Gerenciar Departamentos</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Form */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="dept-name">Nome do Departamento</Label>
                      <Input
                        id="dept-name"
                        placeholder="Ex: Suporte"
                        value={newDepartment.name}
                        onChange={(e) => setNewDepartment({...newDepartment, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dept-desc">Descrição</Label>
                      <Input
                        id="dept-desc"
                        placeholder="Ex: Atendimento técnico"
                        value={newDepartment.description}
                        onChange={(e) => setNewDepartment({...newDepartment, description: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveDepartment}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                    <Button variant="outline" onClick={() => setIsDepartmentModalOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                  
                  {/* List */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Departamentos Cadastrados</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {departments.map((dept) => (
                        <div key={dept.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="font-medium">{dept.name}</span>
                            <p className="text-sm text-muted-foreground">{dept.description}</p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deseja realmente excluir o departamento "{dept.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDepartment(dept.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Employee Button */}
            <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full justify-start" variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Gerenciar Funcionários
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Gerenciar Funcionários</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Form */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="emp-name">Nome Completo</Label>
                      <Input
                        id="emp-name"
                        placeholder="Ex: João Silva"
                        value={newEmployee.name}
                        onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emp-email">E-mail</Label>
                      <Input
                        id="emp-email"
                        type="email"
                        placeholder="joao@empresa.com"
                        value={newEmployee.email}
                        onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emp-phone">Telefone</Label>
                      <Input
                        id="emp-phone"
                        placeholder="+55 11 99999-0000"
                        value={newEmployee.phone}
                        onChange={(e) => setNewEmployee({...newEmployee, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emp-dept">Departamento</Label>
                      <Select value={newEmployee.departmentId} onValueChange={(value) => setNewEmployee({...newEmployee, departmentId: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEmployee}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                    <Button variant="outline" onClick={() => setIsEmployeeModalOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                  
                  {/* List */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Funcionários Cadastrados</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {employees.map((emp) => (
                        <div key={emp.id} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <span className="font-medium">{emp.name}</span>
                            <p className="text-sm text-muted-foreground">{emp.email}</p>
                            <p className="text-sm text-muted-foreground">
                              {getDepartmentName(emp.departmentId)} • {emp.phone}
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deseja realmente excluir o funcionário "{emp.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteEmployee(emp.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/chat')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Ver Conversas
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Numbers Overview */}
      <Card className="bg-gradient-card border-border/50">
        <CardHeader>
          <CardTitle>WhatsApp Configurados para Monitoramento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {whatsappNumbers.map((whatsapp) => (
              <div key={whatsapp.id} className="p-4 border border-border/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{whatsapp.name}</h4>
                  <Badge className={whatsapp.status === 'connected' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                    {whatsapp.status === 'connected' ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{whatsapp.number}</p>
                <Button size="sm" className="mt-2" variant="outline">
                  {whatsapp.status === 'connected' ? 'Desconectar' : 'Conectar'}
                </Button>
              </div>
            ))}
            {whatsappNumbers.length === 0 && (
              <div className="col-span-full text-center py-8">
                <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum WhatsApp configurado</p>
                <p className="text-sm text-muted-foreground">Clique em "Adicionar WhatsApp" para começar</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;