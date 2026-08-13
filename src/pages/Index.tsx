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
import heroBgAsset from "@/assets/hero-bg.png.asset.json";
import fullRefAsset from "@/assets/full-ref.png.asset.json";



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
    { id: "starter", name: "Starter", price: "R$ 250", period: "/mês", description: "Para começar", features: ["1.000 msgs/mês", "3 agentes", "3 departamentos"], highlighted: false },
    { id: "profissional", name: "Profissional", price: "R$ 397", period: "/mês", description: "Mais vendido", features: ["10.000 msgs/mês", "10 agentes", "10 departamentos", "IA avançada", "Suporte prioritário"], highlighted: true },
    { id: "enterprise", name: "Enterprise", price: "R$ 597", period: "/mês", description: "Escalável", features: ["Ilimitado", "Agentes ilimitados", "API personalizada", "Suporte dedicado"], highlighted: false },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-border/50 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center">
            <DsaLogo size={160} />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#features" className="hover:text-primary transition-colors">Recursos</a>
            <a href="#plans" className="hover:text-primary transition-colors">Planos</a>
            <Button variant="ghost" onClick={() => navigate("/auth")}>Entrar</Button>
            <Button variant="hero" onClick={() => navigate("/auth")}>Cadastrar</Button>
          </div>
          <div className="md:hidden">
             <Button variant="hero" size="sm" onClick={() => navigate("/auth")}>Começar</Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroBgAsset.url} 
            alt="Background" 
            className="w-full h-full object-cover opacity-40"
          />
        </div>
        <div className="container relative z-10 mx-auto px-4 text-center lg:text-left lg:grid lg:grid-cols-2 lg:items-center gap-12">
          <div>
            <Badge className="mb-6 bg-blue-100 text-blue-700 border-blue-200">Automação e Gestão Inteligente via WhatsApp</Badge>
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight text-[#0a1b3d]">
              Atendimento por setores,<br />
              <span className="text-primary">mais controle, mais agilidade</span> e mais segurança.
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl">
              Gerencie múltiplos atendentes, setores e automações inteligentes em um único lugar.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" variant="hero" className="text-lg px-8 h-14" onClick={() => navigate("/auth")}>
                Experimentar Grátis <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 h-14 border-2">
                Ver Demonstração
              </Button>
            </div>
          </div>
          <div className="hidden lg:block">
             <div className="relative">
                <div className="absolute -inset-4 bg-blue-500/10 rounded-3xl blur-3xl"></div>
                <Card className="relative border-0 shadow-2xl overflow-hidden rounded-2xl">
                   <img 
                    src={fullRefAsset.url} 
                    alt="Chat Zap Flow Interface" 
                    className="w-full h-auto"
                   />
                </Card>
             </div>
          </div>
        </div>
      </section>

      <section id="features" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4 text-[#0a1b3d]">Gestão Centralizada</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Tudo que sua empresa precisa para operar com tranquilidade e escala.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <Card key={i} className="p-8 bg-white hover:shadow-elegant transition-all duration-300 border-border/50 group">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
                <f.icon className="h-7 w-7 text-primary group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-[#0a1b3d]">{f.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{f.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-[#0a1b3d] text-white py-20">
        <div className="container mx-auto px-4 grid md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold mb-2">98%</div>
            <div className="text-blue-300">Taxa de Resposta</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">10x</div>
            <div className="text-blue-300">Mais Agilidade</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">24/7</div>
            <div className="text-blue-300">Atendimento IA</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">+5k</div>
            <div className="text-blue-300">Empresas Felizes</div>
          </div>
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
              <Button className="w-full" variant={plan.highlighted ? "hero" : "premium"} size="lg" onClick={() => navigate(`/checkout?plan=${plan.id}`)}>Escolher Plano</Button>
            </Card>
          ))}
        </div>
      </section>

      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center">
            <DsaLogo size={120} />
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
             <a href="#" className="hover:text-primary">Termos</a>
             <a href="#" className="hover:text-primary">Privacidade</a>
             <a href="#" className="hover:text-primary">Contato</a>
          </div>
          <p className="text-muted-foreground text-sm">© 2026 Chat Zap Flow IA. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};


export default Index;
