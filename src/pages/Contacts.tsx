import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, UserRound, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface WhatsAppContact {
  id: string;
  name: string | null;
  phone: string | null;
  wa_chat_id: string | null;
  last_message_preview: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

const Contacts = () => {
  const { effectiveTenantId } = useActiveTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["whatsapp-contacts", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: async () => {
      if (!effectiveTenantId) return [] as WhatsAppContact[];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, wa_chat_id, last_message_preview, metadata, updated_at")
        .eq("tenant_id", effectiveTenantId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WhatsAppContact[];
    },
  });

  useEffect(() => {
    if (!effectiveTenantId) return;
    const channel = supabase
      .channel(`contacts-${effectiveTenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `tenant_id=eq.${effectiveTenantId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["whatsapp-contacts", effectiveTenantId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveTenantId, queryClient]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.phone, contact.wa_chat_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [contacts, search]);

  const syncedCount = contacts.filter((contact) => contact.metadata?.synced_from_whatsapp === true).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Contatos WhatsApp</h1>
          <p className="text-muted-foreground">
            Contatos e conversas sincronizados diretamente do WhatsApp conectado via Baileys.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{contacts.length} contatos</Badge>
          <Badge variant="outline">{syncedCount} sincronizados</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Lista de contatos
          </CardTitle>
          <div className="relative mt-3 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome ou telefone..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando contatos...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium">Nenhum contato sincronizado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Após conectar o WhatsApp, os contatos disponíveis no histórico e nas conversas aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {filtered.map((contact) => {
                const isGroup = contact.metadata?.is_group === true;
                const sourceKind = contact.metadata?.source_kind ? String(contact.metadata.source_kind) : null;
                return (
                  <div key={contact.id} className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {isGroup ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{contact.name || contact.phone || "Contato"}</p>
                        {isGroup && <Badge variant="secondary">Grupo</Badge>}
                        {sourceKind && <Badge variant="outline" className="text-xs">{sourceKind}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{contact.phone || contact.wa_chat_id || "Sem telefone"}</p>
                      {contact.last_message_preview && (
                        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MessageSquareText className="h-4 w-4 shrink-0" />
                          <span className="truncate">{contact.last_message_preview}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Contacts;
