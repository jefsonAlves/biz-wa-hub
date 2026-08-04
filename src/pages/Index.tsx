import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, Users, Shield, Bot, Clock, BarChart3,
  CheckCircle, ArrowRight, Building2
} from "lucide-react";
import { DsaLogo } from "@/components/DsaLogo";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const features = [
    { icon: MessageSquare, title: "WhatsApp Multi-Agente", description: "Conecte múltiplos atendentes em um único número WhatsApp da empresa" },
    { icon: Users, title: "Gestão de Setores", description: "Organize equipes por departamentos: Vendas, Suporte, Financeiro" },
    { icon: Shield, title: "Controle Hierárquico", description: "Permissões granulares para cada tipo de usuário e função" },
    { icon: Bot, title: "Agentes Inteligentes", description: "IA personalizada para cada empresa com fluxos automatizados" },
    { icon: Clock, title: "Horários Controlados", description: "Defina horários de atendimento e escalas por setor" },
    { icon: BarChart3, title: "Relatórios Avançados", description: "Dashboards completos com métricas de performance" },
  ];

  const plans = [
    { name: "Free", price: "Grátis", period: "", description: "Para testar", features: ["500 msgs/mês", "2 agentes", "2 departamentos"], highlighted: false },
    { name: "Pro", price: "R$ 297", period: "/mês", description: "Para empresas", features: ["10.000 msgs/mês", "10 agentes", "10 departamentos", "IA avançada", "Suporte prioritário"], highlighted: true },
    { name: "Enterprise", price: "Sob consulta", period: "", description: "Grandes operações", features: ["Ilimitado", "Agentes ilimitados", "API personalizada", "Suporte dedicado"], highlighted: false },
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <DsaLogo size={120} />
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/auth")}>Entrar</Button>
            <Button variant="hero" onClick={() => navigate("/auth")}>Cadastrar</Button>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 text-center">
        <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">Plataforma SaaS de Atendimento</Badge>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Revolucione seu atendimento<br /><span className="text-primary">via WhatsApp</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Gerencie múltiplos atendentes, setores e agentes inteligentes em um único número WhatsApp.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" variant="hero" className="text-lg px-8" onClick={() => navigate("/auth")}>
            Começar Grátis <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Recursos Poderosos</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Tudo que sua empresa precisa para otimizar o atendimento via WhatsApp</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <Card key={i} className="p-6 bg-gradient-card hover:shadow-elegant transition-all duration-300 border-border/50">
              <f.icon className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Planos</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <Card key={i} className={`p-8 relative ${plan.highlighted ? 'border-primary bg-gradient-card shadow-glow scale-105' : 'bg-gradient-card border-border/50'}`}>
              {plan.highlighted && <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">Mais Popular</Badge>}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-3"><CheckCircle className="h-5 w-5 text-primary flex-shrink-0" /><span className="text-sm">{f}</span></li>
                ))}
              </ul>
              <Button className="w-full" variant={plan.highlighted ? "hero" : "premium"} size="lg" onClick={() => navigate("/auth")}>Escolher Plano</Button>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/10 bg-background/80 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <DsaLogo size={80} />
          </div>
          <p className="text-muted-foreground text-sm">© 2026 DSA Projetos e Consultoria. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
