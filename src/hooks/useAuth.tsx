import { useState, useEffect, useContext, createContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "tenant_admin" | "agent" | "viewer";

interface AuthProfile {
  id: string;
  user_id: string;
  tenant_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_available: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, companyName: string, documentType: "cnpj" | "mei", documentNumber: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  isAgent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, retryCount = 0): Promise<void> => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (data) {
      setProfile(data as AuthProfile);
      // Se veio sem tenant_id, aguardar e tentar novamente (trigger pode estar sendo processado)
      if (!data.tenant_id && retryCount < 3) {
        setTimeout(() => fetchProfile(userId, retryCount + 1), 1500);
      } else if (data.tenant_id) {
        // Garantir que os roles foram carregados quando o tenant_id estiver disponível
        fetchRoles(userId);
      }
    } else if (retryCount < 2) {
      // Profile ainda não existe, aguardar trigger criar
      setTimeout(() => fetchProfile(userId, retryCount + 1), 1500);
    }
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) setRoles(data.map((r: any) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }

        if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, companyName: string, documentType: "cnpj" | "mei", documentNumber: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          company_name: companyName,
          document_type: documentType,
          document_number: documentNumber,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = roles.includes("super_admin");
  const isTenantAdmin = roles.includes("tenant_admin");
  const isAgent = roles.includes("agent");

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, roles, loading,
        signIn, signUp, signOut, hasRole,
        isSuperAdmin, isTenantAdmin, isAgent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
