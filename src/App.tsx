import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppearanceProvider } from "@/hooks/useAppearance";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Departments from "./pages/Departments";
import AgentsConfig from "./pages/AgentsConfig";
import Knowledge from "./pages/Knowledge";
import Settings from "./pages/Settings";
import Connections from "./pages/Connections";
import N8nIntegration from "./pages/N8nIntegration";
import Team from "./pages/Team";
import Roles from "./pages/Roles";
import AiAttendance from "./pages/AiAttendance";
import AiProviders from "./pages/AiProviders";
import Inbox from "./pages/Inbox";
import Reports from "./pages/Reports";
import AdminTenants from "./pages/AdminTenants";
import AdminLogs from "./pages/AdminLogs";
import AdminPlans from "./pages/AdminPlans";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppearanceProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/register" element={<Navigate to="/auth" replace />} />

              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
              <Route path="/inbox" element={<ProtectedRoute><DashboardLayout><Inbox /></DashboardLayout></ProtectedRoute>} />
              <Route path="/departments" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Departments /></DashboardLayout></ProtectedRoute>} />
              <Route path="/agents" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><AgentsConfig /></DashboardLayout></ProtectedRoute>} />
              <Route path="/knowledge" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Knowledge /></DashboardLayout></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
              <Route path="/connections" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Connections /></DashboardLayout></ProtectedRoute>} />
              <Route path="/integrations/n8n" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><N8nIntegration /></DashboardLayout></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Team /></DashboardLayout></ProtectedRoute>} />
              <Route path="/roles" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><Roles /></DashboardLayout></ProtectedRoute>} />
              <Route path="/ai-attendance" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><AiAttendance /></DashboardLayout></ProtectedRoute>} />
              <Route path="/ai-providers" element={<ProtectedRoute requiredRoles={["super_admin", "tenant_admin"]}><DashboardLayout><AiProviders /></DashboardLayout></ProtectedRoute>} />

              <Route path="/reports" element={<ProtectedRoute><DashboardLayout><Reports /></DashboardLayout></ProtectedRoute>} />
              <Route path="/my-conversations" element={<ProtectedRoute><DashboardLayout><Inbox /></DashboardLayout></ProtectedRoute>} />

              {/* Admin routes */}
              <Route path="/admin/tenants" element={<ProtectedRoute requiredRoles={["super_admin"]}><DashboardLayout><AdminTenants /></DashboardLayout></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requiredRoles={["super_admin"]}><DashboardLayout><AdminTenants /></DashboardLayout></ProtectedRoute>} />
              <Route path="/admin/plans" element={<ProtectedRoute requiredRoles={["super_admin"]}><DashboardLayout><AdminPlans /></DashboardLayout></ProtectedRoute>} />
              <Route path="/admin/logs" element={<ProtectedRoute requiredRoles={["super_admin"]}><DashboardLayout><AdminLogs /></DashboardLayout></ProtectedRoute>} />

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
      </AppearanceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
