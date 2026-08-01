import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MessageSquare, Eye, EyeOff, Mail, Lock, User, FileText } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/** Only same-origin relative paths are accepted as a post-login redirect. */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

// CPF: 000.000.000-00
function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// CNPJ: 00.000.000/0000-00
function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function validateCPF(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

function validateCNPJ(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: string, weights: number[]) =>
    weights.reduce((s, w, i) => s + parseInt(n[i]) * w, 0);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const r1 = calc(d, w1) % 11;
  if ((r1 < 2 ? 0 : 11 - r1) !== parseInt(d[12])) return false;
  const r2 = calc(d, w2) % 11;
  return (r2 < 2 ? 0 : 11 - r2) === parseInt(d[13]);
}

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [documentType, setDocumentType] = useState<"cpf" | "cnpj">("cpf");
  const [documentNumber, setDocumentNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const { user, loading, signIn, signUp } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      if (nextPath) {
        window.location.replace(nextPath);
      } else {
        navigate("/dashboard");
      }
    }
  }, [user, loading, navigate, nextPath]);

  const handleDocumentChange = (value: string) => {
    if (documentType === "cpf") {
      setDocumentNumber(formatCPF(value));
    } else {
      setDocumentNumber(formatCNPJ(value));
    }
  };

  const handleDocumentTypeChange = (value: "cpf" | "cnpj") => {
    setDocumentType(value);
    setDocumentNumber("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          let msg = "Email ou senha incorretos.";
          if (error.message.includes("Invalid login")) msg = "Email ou senha incorretos.";
          else if (error.message.includes("Email not confirmed"))
            msg = "Confirme seu email antes de fazer login. Verifique sua caixa de entrada.";
          else msg = error.message;
          toast({ title: "Erro no login", description: msg, variant: "destructive" });
        } else {
          toast({ title: "Login realizado!", description: "Bem-vindo de volta!" });
          if (nextPath) window.location.replace(nextPath);
          else navigate("/dashboard");
        }
      } else {
        if (password.length < 6) {
          toast({ title: "Senha fraca", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast({ title: "Senhas diferentes", description: "A senha e a confirmação não coincidem.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        const rawDigits = documentNumber.replace(/\D/g, "");
        if (documentType === "cpf" && !validateCPF(rawDigits)) {
          toast({ title: "CPF inválido", description: "Verifique o CPF informado.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        if (documentType === "cnpj" && !validateCNPJ(rawDigits)) {
          toast({ title: "CNPJ inválido", description: "Verifique o CNPJ informado.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName, documentType, rawDigits);
        if (error) {
          let msg = error.message;
          if (error.message.includes("already registered")) msg = "Este email já está cadastrado. Tente fazer login.";
          toast({ title: "Erro no cadastro", description: msg, variant: "destructive" });
        } else {
          toast({
            title: "Cadastro realizado!",
            description: "Bem-vindo ao AgentFlow! Verifique seu email para confirmar o cadastro.",
          });
          navigate("/dashboard");
        }
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro inesperado. Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <MessageSquare className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">AgentFlow</span>
        </div>

        <Card className="p-8 bg-gradient-card border-border/50 shadow-elegant">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">
              {isLogin ? "Bem-vindo de volta" : "Crie sua conta"}
            </h1>
            <p className="text-muted-foreground">
              {isLogin ? "Acesse sua plataforma de atendimento" : "Comece a usar o AgentFlow"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                {/* Nome completo */}
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Tipo de pessoa */}
                <div className="space-y-2">
                  <Label>Tipo de pessoa</Label>
                  <RadioGroup
                    value={documentType}
                    onValueChange={(v) => handleDocumentTypeChange(v as "cpf" | "cnpj")}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="cpf" id="pf" />
                      <Label htmlFor="pf" className="cursor-pointer font-normal">
                        Pessoa Física (CPF)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="cnpj" id="pj" />
                      <Label htmlFor="pj" className="cursor-pointer font-normal">
                        Pessoa Jurídica (CNPJ)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* CPF ou CNPJ */}
                <div className="space-y-2">
                  <Label htmlFor="document">
                    {documentType === "cpf" ? "CPF" : "CNPJ"}
                  </Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="document"
                      type="text"
                      inputMode="numeric"
                      placeholder={documentType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                      value={documentNumber}
                      onChange={(e) => handleDocumentChange(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
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

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isLogin ? "Sua senha" : "Mínimo 6 caracteres"}
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

            {/* Confirmar senha – somente no cadastro */}
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">As senhas não coincidem.</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              variant="hero"
              size="lg"
              disabled={isLoading}
            >
              {isLoading
                ? isLogin ? "Entrando..." : "Cadastrando..."
                : isLogin ? "Entrar" : "Cadastrar"
              }
            </Button>
          </form>

          <div className="mt-6">
            <Separator className="my-4" />
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {isLogin ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? "Cadastre-se grátis" : "Fazer login"}
                </button>
              </p>
            </div>
          </div>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/">
            <Button variant="ghost">← Voltar para página inicial</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;
