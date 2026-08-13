import { createFileRoute, useSearch, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, AlertCircle, Zap, ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const createAsaasPayment = createServerFn({ method: "POST" })
  .validator((data) => z.object({
    planId: z.string(),
    paymentMethod: z.enum(["PIX", "CREDIT_CARD"]),
    customer: z.object({
      name: z.string().min(3),
      email: z.string().email(),
      cpfCnpj: z.string().min(11),
    })
  }).parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env['ASAAS_API_KEY'];
    if (!apiKey) {
      throw new Error("Configuração do Asaas ausente no servidor.");
    }

    const ASAAS_URL = "https://www.asaas.com/api/v3";
    
    try {
      // 1. Criar ou buscar cliente
      const customerResponse = await fetch(`${ASAAS_URL}/customers`, {
        method: "POST",
        headers: {
          "access_token": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: data.customer.name,
          email: data.customer.email,
          cpfCnpj: data.customer.cpfCnpj
        })
      });

      const customer = await customerResponse.json();
      if (customer.errors) throw new Error(customer.errors[0].description);

      // 2. Definir valor do plano
      const planPrices: Record<string, number> = {
        "starter": 250.00,
        "profissional": 397.00,
        "enterprise": 597.00
      };
      
      const value = planPrices[data.planId] || 250.00;

      // 3. Criar a cobrança
      const paymentResponse = await fetch(`${ASAAS_URL}/payments`, {
        method: "POST",
        headers: {
          "access_token": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customer: customer.id,
          billingType: data.paymentMethod === "PIX" ? "PIX" : "CREDIT_CARD",
          value: value,
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          description: `Assinatura Chat Zap Flow IA - Plano ${data.planId.toUpperCase()}`,
          externalReference: `plan_${data.planId}_${Date.now()}`
        })
      });

      const payment = await paymentResponse.json();
      if (payment.errors) throw new Error(payment.errors[0].description);

      return { 
        success: true,
        paymentUrl: payment.invoiceUrl || payment.bankSlipUrl || "https://chat.zapflowia.online/obrigado",
        paymentId: payment.id
      };
    } catch (error: any) {
      console.error("Erro na integração Asaas:", error);
      throw new Error(error.message || "Falha na comunicação com o Asaas");
    }
  });

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: z.string().optional().catch(undefined).parse(search['plan']),
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { plan } = useSearch({ from: "/checkout" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cpfCnpj: ""
  });

  const handlePayment = async (method: "PIX" | "CREDIT_CARD") => {
    if (loading) return;
    if (!formData.name || !formData.email || !formData.cpfCnpj) {
      setErrorMessage("Por favor, preencha todos os campos do formulário.");
      return;
    }
    
    setLoading(true);
    setStatus("loading");
    setErrorMessage("");
    
    try {
      const result = await createAsaasPayment({ 
        data: {
          planId: plan || "starter", 
          paymentMethod: method,
          customer: formData
        }
      });
      
      if (result && result.success) {
        window.location.href = result.paymentUrl;
      } else {
        throw new Error("Resposta inválida da API");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      setErrorMessage(err.message || "Erro ao processar o pagamento via Asaas.");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-4" />
        <h2 className="text-xl font-bold text-brand-navy">Processando pagamento...</h2>
        <p className="text-muted-foreground">Por favor, não feche esta página.</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-brand-navy">Pagamento realizado com sucesso!</h2>
        <p className="text-muted-foreground mt-2">Sua conta será ativada em instantes.</p>
        <a href="/" className="mt-8 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold">Voltar ao Início</a>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-brand-navy">Erro no Pagamento</h2>
        <p className="text-muted-foreground mt-2">{errorMessage}</p>
        <button onClick={() => setStatus("idle")} className="mt-8 bg-brand-navy text-white px-6 py-3 rounded-xl font-bold">
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-20 px-6">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex justify-center mb-8">
          <Link to="/">
            <img src={logoAsset.url} alt="Chat Zap Flow IA" className="h-10 w-auto" />
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-brand-navy mb-2 text-center">Finalizar Assinatura</h1>
        <p className="text-center text-muted-foreground mb-8 text-sm">Plano selecionado: <span className="font-bold text-brand-blue uppercase">{plan || "Starter"}</span></p>
        
        <div className="space-y-4 mb-8">
          <div>
            <label className="text-xs font-bold text-brand-navy uppercase mb-1 block">Nome Completo</label>
            <input 
              type="text" 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              placeholder="Ex: João Silva"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-brand-navy uppercase mb-1 block">E-mail</label>
            <input 
              type="email" 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              placeholder="Ex: joao@email.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-brand-navy uppercase mb-1 block">CPF ou CNPJ</label>
            <input 
              type="text" 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              placeholder="Apenas números"
              value={formData.cpfCnpj}
              onChange={(e) => setFormData({...formData, cpfCnpj: e.target.value})}
            />
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <button onClick={() => handlePayment("PIX")} className="w-full p-4 border-2 border-slate-100 rounded-xl hover:border-brand-blue cursor-pointer transition-colors flex items-center justify-between group">
            <div className="flex flex-col items-start">
              <span className="font-bold text-brand-navy">Pagar com PIX</span>
              <span className="text-xs text-muted-foreground">Aprovação imediata</span>
            </div>
            <div className="bg-brand-blue/10 p-2 rounded-lg text-brand-blue">
              <Zap className="w-5 h-5" />
            </div>
          </button>
          <button onClick={() => handlePayment("CREDIT_CARD")} className="w-full p-4 border-2 border-slate-100 rounded-xl hover:border-brand-blue cursor-pointer transition-colors flex items-center justify-between group">
            <div className="flex flex-col items-start">
              <span className="font-bold text-brand-navy">Cartão de Crédito</span>
              <span className="text-xs text-muted-foreground">Link de pagamento seguro</span>
            </div>
            <div className="bg-brand-blue/10 p-2 rounded-lg text-brand-blue">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </button>
        </div>

        <p className="mt-8 text-[10px] text-center text-muted-foreground">
          Ao prosseguir, você concorda com nossos termos e política de privacidade.
          Pagamento processado de forma segura via Asaas.
        </p>
      </div>
    </div>
  );
}