import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Users,
  Clock,
  Settings,
  Edit,
  Trash2,
  UserPlus
} from "lucide-react";

const Sectors = () => {
  const { toast } = useToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const sectors = [
    {
      id: "1",
      name: "Suporte Técnico",
      description: "Atendimento para questões técnicas e resolução de problemas",
      agents: 4,
      activeAgents: 3,
      workingHours: "08:00 - 18:00",
      averageResponseTime: "2.3 min",
      totalChats: 145,
      color: "blue"
    },
    {
      id: "2", 
      name: "Vendas",
      description: "Atendimento comercial e prospecção de novos clientes",
      agents: 6,
      activeAgents: 5,
      workingHours: "08:00 - 20:00",
      averageResponseTime: "1.8 min",
      totalChats: 203,
      color: "green"
    },
    {
      id: "3",
      name: "Financeiro",
      description: "Gestão de pagamentos, cobranças e questões financeiras",
      agents: 2,
      activeAgents: 2,
      workingHours: "09:00 - 17:00",
      averageResponseTime: "3.1 min",
      totalChats: 67,
      color: "purple"
    },
    {
      id: "4",
      name: "Recursos Humanos",
      description: "Atendimento interno para colaboradores",
      agents: 1,
      activeAgents: 1,
      workingHours: "08:00 - 17:00",
      averageResponseTime: "5.2 min",
      totalChats: 23,
      color: "orange"
    }
  ];

  const handleCreateSector = () => {
    toast({
      title: "Setor criado com sucesso!",
      description: "O novo setor foi adicionado ao sistema.",
    });
    setIsCreateModalOpen(false);
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case "blue":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "green":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "purple":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "orange":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Setores</h1>
          <p className="text-muted-foreground">
            Organize sua equipe em departamentos especializados
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Setor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Setor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sector-name">Nome do Setor</Label>
                <Input id="sector-name" placeholder="Ex: Suporte Técnico" />
              </div>
              <div>
                <Label htmlFor="sector-description">Descrição</Label>
                <Textarea 
                  id="sector-description" 
                  placeholder="Descreva as responsabilidades deste setor"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="working-hours">Horário de Funcionamento</Label>
                <Input id="working-hours" placeholder="Ex: 08:00 - 18:00" />
              </div>
              <Button onClick={handleCreateSector} className="w-full">
                Criar Setor
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sectors Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {sectors.map((sector) => (
          <Card key={sector.id} className="bg-gradient-card border-border/50 hover:shadow-elegant transition-all duration-200">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{sector.name}</CardTitle>
                    <Badge className={getColorClasses(sector.color)}>
                      {sector.activeAgents}/{sector.agents} ativos
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {sector.description}
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Atendentes:</span>
                    <span className="font-medium">{sector.agents}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Horário:</span>
                    <span className="font-medium">{sector.workingHours}</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Tempo médio:</span>
                    <div className="font-medium">{sector.averageResponseTime}</div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Conversas hoje:</span>
                    <div className="font-medium">{sector.totalChats}</div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-border/50">
                <Button variant="outline" className="w-full">
                  Ver Atendentes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-card border-border/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">4</div>
            <div className="text-sm text-muted-foreground">Setores Ativos</div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-card border-border/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">13</div>
            <div className="text-sm text-muted-foreground">Total Atendentes</div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-card border-border/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">11</div>
            <div className="text-sm text-muted-foreground">Online Agora</div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-card border-border/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-500">2.8min</div>
            <div className="text-sm text-muted-foreground">Resposta Média</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Sectors;