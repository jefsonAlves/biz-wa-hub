import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Users, 
  Shield, 
  Zap, 
  CheckCircle, 
  ArrowRight,
  Building2,
  Bot,
  Clock,
  BarChart3
} from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  const features = [
    {
      icon: MessageSquare,
      title: "WhatsApp Multi-Agente",
      description: "Conecte múltiplos atendentes em um único número WhatsApp da empresa"
    },
    {
      icon: Users,
      title: "Gestão de Setores",
      description: "Organize equipes por departamentos: Vendas, Suporte, Financeiro"
    },
    {
      icon: Shield,
      title: "Controle Hierárquico",
      description: "Permissões granulares para cada tipo de usuário e função"
    },
    {
      icon: Bot,
      title: "Agentes Inteligentes",
      description: "IA personalizada para cada empresa com fluxos automatizados"
    },
    {
      icon: Clock,
      title: "Horários Controlados",
      description: "Defina horários de atendimento e escalas por setor"
    },
    {
      icon: BarChart3,
      title: "Relatórios Avançados",
      description: "Dashboards completos com métricas de performance"
    }
  ];

  const plans = [
    {
      name: "Starter",
      price: "R$ 99",
      period: "/mês",
      description: "Ideal para pequenas empresas",
      features: [
        "1 número WhatsApp",
        "Até 3 atendentes",
        "2 setores",
        "Relatórios básicos",
        "Suporte por email"
      ],
      highlighted: false
    },
    {
      name: "Professional",
      price: "R$ 299",
      period: "/mês",
      description: "Para empresas em crescimento",
      features: [
        "2 números WhatsApp",
        "Até 10 atendentes",
        "5 setores",
        "IA personalizada",
        "Relatórios avançados",
        "Suporte prioritário"
      ],
      highlighted: true
    },
    {
      name: "Enterprise",
      price: "R$ 799",
      period: "/mês",
      description: "Para grandes organizações",
      features: [
        "Números ilimitados",
        "Atendentes ilimitados",
        "Setores ilimitados",
        "IA avançada",
        "API personalizada",
        "Suporte dedicado"
      ],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-border/10 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">WabaFlow Connect</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button variant="hero">Cadastrar</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
          Plataforma SaaS de Atendimento
        </Badge>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Revolucione seu atendimento<br />
          <span className="text-primary">via WhatsApp</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Gerencie múltiplos atendentes, setores e agentes inteligentes em um único número WhatsApp. 
          Controle total com hierarquia de permissões e relatórios avançados.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" variant="hero" className="text-lg px-8">
            Começar Grátis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="premium" className="text-lg px-8">
            Ver Demonstração
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Recursos Poderosos</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Tudo que sua empresa precisa para otimizar o atendimento via WhatsApp
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="p-6 bg-gradient-card hover:shadow-elegant transition-all duration-300 border-border/50">
              <feature.icon className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Planos que Escalam com Seu Negócio</h2>
          <p className="text-muted-foreground text-lg">
            Escolha o plano ideal para sua empresa
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`p-8 relative ${
                plan.highlighted 
                  ? 'border-primary bg-gradient-card shadow-glow scale-105' 
                  : 'bg-gradient-card border-border/50'
              }`}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                  Mais Popular
                </Badge>
              )}
              
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className="w-full" 
                variant={plan.highlighted ? "hero" : "premium"}
                size="lg"
              >
                Escolher Plano
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="p-12 text-center bg-gradient-card border-border/50">
          <Building2 className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4">Pronto para Transformar seu Atendimento?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Junte-se a centenas de empresas que já utilizam nossa plataforma para 
            otimizar o atendimento via WhatsApp
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="hero" className="text-lg px-8">
              Começar Teste Grátis
            </Button>
            <Button size="lg" variant="premium" className="text-lg px-8">
              Falar com Especialista
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/10 bg-background/80 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="font-semibold">WabaFlow Connect</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © 2024 WabaFlow Connect. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;