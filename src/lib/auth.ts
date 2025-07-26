// Sistema de autenticação simulado - Em produção, usar Supabase
export interface User {
  id: string;
  email: string;
  name: string;
  type: "admin" | "company" | "employee";
  companyId?: string;
  departmentId?: string;
}

// Usuários do sistema (simulado)
const SYSTEM_USERS = {
  // Administrador Master
  "jefson.ti@gmail.com": {
    id: "1",
    email: "jefson.ti@gmail.com",
    name: "Jefson",
    type: "admin" as const,
    password: "1427Manu"
  },
  // Usuários de demonstração
  "admin@demo.com": {
    id: "2",
    email: "admin@demo.com", 
    name: "Admin Demo",
    type: "admin" as const,
    password: "demo123"
  },
  "empresa@demo.com": {
    id: "3",
    email: "empresa@demo.com",
    name: "Empresa Demo",
    type: "company" as const,
    password: "demo123",
    companyId: "comp1"
  },
  "funcionario@demo.com": {
    id: "4",
    email: "funcionario@demo.com",
    name: "Funcionário Demo", 
    type: "employee" as const,
    password: "demo123",
    companyId: "comp1",
    departmentId: "vendas"
  }
};

export const authenticate = async (email: string, password: string): Promise<User | null> => {
  // Simular delay de rede
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const normalizedEmail = email.toLowerCase().trim();
  const user = SYSTEM_USERS[normalizedEmail as keyof typeof SYSTEM_USERS];
  
  if (user && user.password === password) {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  return null;
};

export const getCurrentUser = (): User | null => {
  const userStr = localStorage.getItem("current_user");
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

export const setCurrentUser = (user: User) => {
  localStorage.setItem("current_user", JSON.stringify(user));
};

export const logout = () => {
  localStorage.removeItem("current_user");
};

export const isAdmin = (user: User | null): boolean => {
  return user?.type === "admin";
};

export const getRedirectPath = (user: User): string => {
  switch (user.type) {
    case "admin":
      return "/admin/dashboard";
    case "company":
      return "/company/dashboard";
    case "employee":
      return "/employee/dashboard";
    default:
      return "/dashboard";
  }
};