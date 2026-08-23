import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "zapflowia.activeTenantId";

export function useActiveTenant() {
  const { profile, isSuperAdmin, user } = useAuth();
  const [selectedTenantId, setSelectedTenantIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["admin-tenants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!isSuperAdmin || tenants.length === 0) return;
    const storedIsValid = tenants.some((tenant) => tenant.id === selectedTenantId);
    if (storedIsValid) return;

    // Para uma única empresa não há escolha a fazer. Com várias, mantém a
    // primeira como padrão até o administrador trocar explicitamente.
    const fallback = tenants[0].id;
    setSelectedTenantIdState(fallback);
    window.localStorage.setItem(STORAGE_KEY, fallback);
  }, [isSuperAdmin, selectedTenantId, tenants]);

  useEffect(() => {
    if (!isSuperAdmin && profile?.tenant_id) {
      setSelectedTenantIdState(profile.tenant_id);
    }
  }, [isSuperAdmin, profile?.tenant_id]);

  const setSelectedTenantId = (tenantId: string | null) => {
    setSelectedTenantIdState(tenantId);
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("zapflowia:active-tenant", { detail: tenantId }));
  };

  useEffect(() => {
    const sync = (event: Event) => {
      setSelectedTenantIdState((event as CustomEvent<string | null>).detail ?? null);
    };
    window.addEventListener("zapflowia:active-tenant", sync);
    return () => window.removeEventListener("zapflowia:active-tenant", sync);
  }, []);

  const effectiveTenantId = useMemo(
    () => (isSuperAdmin ? selectedTenantId : profile?.tenant_id ?? null),
    [isSuperAdmin, profile?.tenant_id, selectedTenantId],
  );

  return {
    effectiveTenantId,
    selectedTenantId,
    setSelectedTenantId,
    tenants,
    tenantsLoading,
    userId: user?.id ?? null,
  };
}
