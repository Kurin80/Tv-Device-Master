import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Pages
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import DeviceDetail from "@/pages/device-detail";
import Logs from "@/pages/logs";
import Users from "@/pages/users";
import Schedule from "@/pages/schedule";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return null;
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/devices" component={() => <ProtectedRoute component={Devices} />} />
      <Route path="/devices/:id" component={() => <ProtectedRoute component={DeviceDetail} />} />
      <Route path="/logs" component={() => <ProtectedRoute component={Logs} />} />
      <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
      <Route path="/schedule" component={() => <ProtectedRoute component={Schedule} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
