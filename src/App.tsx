import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="dark">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/register" element={<Navigate to="/auth" replace />} />

              {/* Protected routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardLayout><Dashboard /></DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/inbox" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Inbox</h2>
                      <p>Em breve: conversas em tempo real via WhatsApp</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/agents" element={
                <ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Agentes IA</h2>
                      <p>Em breve: configure personas e prompts de IA</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/knowledge" element={
                <ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Base de Conhecimento</h2>
                      <p>Em breve: upload de documentos e RAG</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/departments" element={
                <ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Departamentos</h2>
                      <p>Em breve: gerencie departamentos</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/team" element={
                <ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Equipe</h2>
                      <p>Em breve: gerencie membros da equipe</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/reports" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Relatórios</h2>
                      <p>Em breve: métricas e analytics</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Configurações</h2>
                      <p>Em breve: Z-API, horários, moderação</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/my-conversations" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Meus Atendimentos</h2>
                      <p>Em breve: suas conversas atribuídas</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />

              {/* Admin routes */}
              <Route path="/admin/tenants" element={
                <ProtectedRoute requiredRoles={["super_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Tenants</h2>
                      <p>Em breve: gerenciamento de empresas</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute requiredRoles={["super_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Usuários</h2>
                      <p>Em breve: gerenciamento de usuários</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/plans" element={
                <ProtectedRoute requiredRoles={["super_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Planos</h2>
                      <p>Em breve: gerenciamento de planos</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              <Route path="/admin/logs" element={
                <ProtectedRoute requiredRoles={["super_admin"]}>
                  <DashboardLayout>
                    <div className="text-center py-20 text-muted-foreground">
                      <h2 className="text-2xl font-bold mb-2">Logs do Sistema</h2>
                      <p>Em breve: auditoria e logs</p>
                    </div>
                  </DashboardLayout>
                </ProtectedRoute>
              } />

              {/* Legacy redirects */}
              <Route path="/admin/dashboard" element={<Navigate to="/dashboard" replace />} />
              <Route path="/company/*" element={<Navigate to="/dashboard" replace />} />
              <Route path="/employee/*" element={<Navigate to="/dashboard" replace />} />
              <Route path="/chat" element={<Navigate to="/inbox" replace />} />
              <Route path="/sectors" element={<Navigate to="/departments" replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
