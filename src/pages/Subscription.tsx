import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, AlertCircle, Loader2, Zap } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";

export default function SubscriptionPage() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["my-subscription", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["available-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Assinatura e Cobrança</h1>
          <p className="text-muted-foreground">Gerencie o plano da sua empresa e histórico de pagamentos.</p>
        </div>

        {subscription ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-bold text-primary">Plano {subscription.plans?.name}</CardTitle>
                <CardDescription>Sua assinatura está ativa e regular.</CardDescription>
              </div>
              <Badge className="bg-emerald-500">Ativo</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6 py-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider">Valor Mensal</p>
                  <p className="text-xl font-bold text-slate-900">R$ {subscription.plans?.price}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider">Próximo Vencimento</p>
                  <p className="text-xl font-bold text-slate-900">
                    {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "N/A"}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <Button variant="outline" className="gap-2">
                    <CreditCard className="h-4 w-4" /> Atualizar Pagamento
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-4 py-6">
              <AlertCircle className="h-10 w-10 text-amber-500" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900">Sem assinatura ativa</h3>
                <p className="text-amber-700">Selecione um plano abaixo para liberar todos os recursos da plataforma.</p>
              </div>
              <Button className="bg-amber-600 hover:bg-amber-700">Escolher Plano</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {plans.map((plan: any) => (
            <Card key={plan.id} className={subscription?.plan_id === plan.id ? "border-primary shadow-md ring-1 ring-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {subscription?.plan_id === plan.id && <Badge className="text-[10px]">Atual</Badge>}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">R$ {plan.price}</span>
                  <span className="text-xs text-muted-foreground">/mês</span>
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {plan.max_connections} Conexão(ões)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {plan.max_agents} Agentes</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Suporte prioritário</li>
                </ul>
                <Button 
                  className="w-full" 
                  variant={subscription?.plan_id === plan.id ? "outline" : "default"}
                  disabled={subscription?.plan_id === plan.id}
                  onClick={() => window.location.href = `/checkout?plan=${plan.name.toLowerCase()}`}
                >
                  {subscription?.plan_id === plan.id ? "Plano Atual" : "Alterar Plano"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}