import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulação de login - substituir por integração real
    setTimeout(() => {
      if (email && password) {
        toast({
          title: "Login realizado com sucesso!",
          description: "Redirecionando para o dashboard...",
        });
        // Redirecionar baseado no tipo de usuário
        if (email.includes("admin")) {
          navigate("/admin/dashboard");
        } else {
          navigate("/company/dashboard");
        }
      } else {
        toast({
          title: "Erro no login",
          description: "Por favor, preencha todos os campos.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <MessageSquare className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">WabaFlow Connect</span>
        </div>

        <Card className="p-8 bg-gradient-card border-border/50 shadow-elegant">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Bem-vindo de volta</h1>
            <p className="text-muted-foreground">
              Acesse sua plataforma de atendimento
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" />
                <span className="text-muted-foreground">Lembrar de mim</span>
              </label>
              <Link to="/forgot-password" className="text-primary hover:underline">
                Esqueceu a senha?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              variant="hero" 
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-6">
            <Separator className="my-4" />
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                Não tem uma conta?{" "}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Cadastre-se grátis
                </Link>
              </p>
            </div>
          </div>

          {/* Links para diferentes tipos de acesso */}
          <div className="mt-6 p-4 bg-muted/20 rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Acesso rápido para demonstração:</p>
            <div className="flex flex-col gap-1 text-xs">
              <span>👤 Admin: admin@demo.com</span>
              <span>🏢 Empresa: empresa@demo.com</span>
              <span>👥 Funcionário: funcionario@demo.com</span>
            </div>
          </div>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/">
            <Button variant="ghost">
              ← Voltar para página inicial
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;