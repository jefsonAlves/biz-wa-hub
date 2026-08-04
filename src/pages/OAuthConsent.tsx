import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: detailsError } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou um redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "o aplicativo";

  return (
    <main className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <MessageSquare className="h-8 w-8 text-primary" aria-hidden="true" />
          <span className="text-2xl font-bold text-foreground">DSA WA Hub</span>
        </div>

        <Card className="p-8 bg-gradient-card border-border/50 shadow-elegant space-y-4">
          {error ? (
            <>
              <h1 className="text-xl font-bold">Não foi possível carregar a autorização</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
            </>
          ) : !details ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              <span>Carregando pedido de autorização…</span>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold">Conectar {clientName} à sua conta</h1>
              <p className="text-sm text-muted-foreground">
                {clientName} poderá usar as ferramentas do DSA WA Hub como você: ler conversas,
                contatos e a base de conhecimento da sua empresa e criar notas internas. O acesso
                respeita suas permissões e o isolamento da sua empresa.
              </p>
              <div className="flex gap-3 pt-2">
                <Button onClick={() => decide(true)} disabled={busy} variant="hero" className="flex-1">
                  {busy ? "Processando…" : "Autorizar"}
                </Button>
                <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">
                  Recusar
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
