import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, 
  MonitorSmartphone, 
  Terminal, 
  Users, 
  CalendarClock,
  LogOut,
  Menu,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";

function useAdbMode() {
  const [mode, setMode] = useState<"simulation" | "real" | null>(null);
  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => r.json())
      .then((d) => setMode(d.adbMode ?? null))
      .catch(() => {});
  }, []);
  return mode;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const adbMode = useAdbMode();

  const navigation = [
    { name: 'Panel', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Dispositivos', href: '/devices', icon: MonitorSmartphone },
    { name: 'Registros', href: '/logs', icon: Terminal },
    { name: 'Rutinas', href: '/schedule', icon: CalendarClock },
  ];

  if (user?.role === 'admin') {
    navigation.push({ name: 'Usuarios', href: '/users', icon: Users });
  }

  const NavLinks = () => (
    <>
      {navigation.map((item) => {
        const isActive = location === item.href || location.startsWith(`${item.href}/`);
        return (
          <Link key={item.name} href={item.href}>
            <div
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              data-testid={`nav-${item.name.toLowerCase()}`}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* Cabecera móvil */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 font-bold text-primary">
          <MonitorSmartphone className="h-5 w-5" />
          MDM Ops
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] flex flex-col p-0 bg-sidebar border-sidebar-border text-sidebar-foreground">
            <div className="p-6 border-b border-sidebar-border">
              <div className="flex items-center gap-2 font-bold text-sidebar-primary text-xl">
                <MonitorSmartphone className="h-6 w-6" />
                MDM Ops
              </div>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2">
              <NavLinks />
            </nav>
            <div className="p-4 border-t border-sidebar-border">
              <div className="mb-4 px-2">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.email}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.tenantName || 'Tenant'}</p>
              </div>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground" 
                onClick={() => logout()}
                data-testid="button-logout-mobile"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Barra lateral escritorio */}
      <div className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-bold text-sidebar-primary text-xl tracking-tight">
            <MonitorSmartphone className="h-6 w-6" />
            MDM Ops
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-4">
          <nav className="space-y-1.5">
            <NavLinks />
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border bg-sidebar/50">
          {/* Indicador de modo ADB */}
          {adbMode && (
            <div className={`mb-3 px-3 py-2 rounded-md border font-mono text-[10px] uppercase tracking-wider flex items-center gap-2 ${
              adbMode === "simulation"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`} data-testid="adb-mode-badge">
              {adbMode === "simulation"
                ? <><FlaskConical className="h-3 w-3 shrink-0" /> ADB Simulado</>
                : <><MonitorSmartphone className="h-3 w-3 shrink-0" /> ADB Real</>
              }
            </div>
          )}
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
              {user?.email?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate" data-testid="text-user-email">{user?.email}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate uppercase tracking-wider font-mono">{user?.tenantName || 'Tenant'} &bull; {user?.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" 
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Banner de simulación ADB — visible en toda la interfaz */}
        {adbMode === "simulation" && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-2 font-mono text-[11px] text-amber-400 uppercase tracking-wider" data-testid="simulation-banner">
            <FlaskConical className="h-3 w-3 shrink-0" />
            Modo simulación ADB activo — los comandos no se ejecutan en TVs reales.
            Para producción, desactiva ADB_SIMULATION en la configuración del servidor.
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
