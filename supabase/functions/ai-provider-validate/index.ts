// Validates an AI provider configuration for the caller's tenant.
// Secrets are read from the Edge Function environment and NEVER returned.
import { corsHeaders, json, serviceClient, authenticate, isTenantAdmin } from "../_shared/n8n.ts";

type Provider = "ollama" | "openai" | "gemini";

const SECRET_BY_PROVIDER: Record<Provider, string | null> = {
  ollama: null,
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

async function probe(provider: Provider, model: string | null, baseUrl: string | null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    if (provider === "ollama") {
      const root = (baseUrl || "http://localhost:11434").replace(/\/$/, "");
      const res = await fetch(`${root}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { ok: false, error: `Ollama respondeu ${res.status}` };
      const body = await res.json().catch(() => ({}));
      const models: string[] = (body?.models ?? []).map((m: { name?: string }) => m?.name ?? "");
      if (model && models.length && !models.some((m) => m.startsWith(model))) {
        return { ok: false, error: `Modelo "${model}" não encontrado no Ollama` };
      }
      return { ok: true };
    }

    const secretName = SECRET_BY_PROVIDER[provider]!;
    const key = Deno.env.get(secretName);
    if (!key) return { ok: false, error: `Segredo ${secretName} não configurado`, notConfigured: true };

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, error: `OpenAI respondeu ${res.status}` };
      return { ok: true };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: controller.signal },
    );
    if (!res.ok) return { ok: false, error: `Gemini respondeu ${res.status}` };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha de conexão";
    return { ok: false, error: message.slice(0, 200) };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const auth = await authenticate(req);
  if ("error" in auth) return json({ error: auth.error }, 401);

  const svc = serviceClient();
  if (!(await isTenantAdmin(svc, auth.userId, auth.tenantId))) {
    return json({ error: "Permissão insuficiente" }, 403);
  }

  let payload: { provider?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const provider = payload.provider as Provider;
  if (!provider || !(provider in SECRET_BY_PROVIDER)) {
    return json({ error: "Provedor inválido" }, 400);
  }

  const { data: row } = await svc
    .from("ai_provider_settings")
    .select("id, model, base_url")
    .eq("tenant_id", auth.tenantId)
    .eq("provider", provider)
    .maybeSingle();

  if (!row) return json({ error: "Provedor não configurado para esta empresa" }, 404);

  await svc.from("ai_provider_settings").update({ status: "validating", validation_error: null }).eq("id", row.id);

  const result = await probe(provider, row.model, row.base_url);

  await svc
    .from("ai_provider_settings")
    .update({
      status: result.ok ? "active" : result.notConfigured ? "not_configured" : "error",
      validation_error: result.ok ? null : result.error ?? "Falha na validação",
      last_validated_at: new Date().toISOString(),
      is_active: result.ok,
    })
    .eq("id", row.id);

  return json({
    provider,
    status: result.ok ? "active" : result.notConfigured ? "not_configured" : "error",
    message: result.ok ? "Provedor validado" : result.error,
    required_secret: result.notConfigured ? SECRET_BY_PROVIDER[provider] : null,
  });
});
