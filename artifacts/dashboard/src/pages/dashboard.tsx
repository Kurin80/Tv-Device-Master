import { 
  useGetDevices, 
  useGetAllLogs, 
  useGetTenant 
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonitorSmartphone, Wifi, WifiOff, HelpCircle, Activity, Server, Clock, AlertTriangle, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: tenant, isLoading: isTenantLoading } = useGetTenant();
  const { data: devices, isLoading: isDevicesLoading } = useGetDevices();
  const { data: logs, isLoading: isLogsLoading } = useGetAllLogs({ query: { limit: 5 } });

  const stats = {
    total: devices?.length || 0,
    online: devices?.filter(d => d.status === 'online').length || 0,
    offline: devices?.filter(d => d.status === 'offline').length || 0,
    unknown: devices?.filter(d => d.status === 'unknown').length || 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'offline': return 'text-destructive bg-destructive/10 border-destructive/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-destructive';
      case 'warn':
      case 'warning': return 'text-amber-500';
      case 'info': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1" data-testid="text-dashboard-title">Fleet Overview</h1>
            {isTenantLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
                {tenant?.name} <span className="mx-2">•</span> SYS_STATUS: OPERATIONAL
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono bg-secondary/50 px-3 py-1.5 rounded-md border border-border">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            <span>LIVE TELEMETRY</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Total Units</p>
                <Server className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-2">
                {isDevicesLoading ? (
                  <Skeleton className="h-10 w-16" />
                ) : (
                  <div className="text-4xl font-bold" data-testid="stat-total">{stats.total}</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Online</p>
                <Wifi className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2">
                {isDevicesLoading ? (
                  <Skeleton className="h-10 w-16" />
                ) : (
                  <div className="text-4xl font-bold text-emerald-500" data-testid="stat-online">{stats.online}</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Offline</p>
                <WifiOff className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex items-baseline gap-2">
                {isDevicesLoading ? (
                  <Skeleton className="h-10 w-16" />
                ) : (
                  <div className="text-4xl font-bold text-destructive" data-testid="stat-offline">{stats.offline}</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-muted-foreground" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Unknown</p>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-2">
                {isDevicesLoading ? (
                  <Skeleton className="h-10 w-16" />
                ) : (
                  <div className="text-4xl font-bold text-muted-foreground" data-testid="stat-unknown">{stats.unknown}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Devices List */}
          <Card className="border-border shadow-sm flex flex-col h-[400px]">
            <CardHeader className="py-4 border-b border-border bg-secondary/20 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-mono uppercase tracking-wider flex items-center gap-2">
                <MonitorSmartphone className="h-5 w-5 text-primary" />
                Nodes
              </CardTitle>
              <Link href="/devices" className="text-xs text-primary hover:underline font-mono uppercase tracking-wider">View All</Link>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
              {isDevicesLoading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : devices && devices.length > 0 ? (
                <div className="divide-y divide-border">
                  {devices.slice(0, 5).map((device) => (
                    <Link key={device.id} href={`/devices/${device.id}`}>
                      <div className="flex items-center justify-between p-4 hover:bg-secondary/40 transition-colors cursor-pointer group" data-testid={`card-device-${device.id}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : device.status === 'offline' ? 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-muted-foreground'}`} />
                          <div>
                            <p className="font-bold group-hover:text-primary transition-colors">{device.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{device.ip}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`font-mono uppercase text-[10px] ${getStatusColor(device.status)}`}>
                          {device.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                  <MonitorSmartphone className="h-10 w-10 mb-2 opacity-20" />
                  <p>No devices provisioned</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Logs */}
          <Card className="border-border shadow-sm flex flex-col h-[400px] bg-sidebar border-sidebar-border">
            <CardHeader className="py-4 border-b border-sidebar-border bg-sidebar/80 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-mono uppercase tracking-wider flex items-center gap-2 text-sidebar-foreground">
                <Terminal className="h-5 w-5 text-primary" />
                System Log
              </CardTitle>
              <Link href="/logs" className="text-xs text-primary hover:underline font-mono uppercase tracking-wider">View All</Link>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto bg-[#0A0E17] font-mono text-sm relative">
              {/* Scanline effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.2)_51%)] bg-[length:100%_4px] opacity-20 z-10" />
              
              {isLogsLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-6 w-3/4 bg-sidebar-accent/50" />
                  <Skeleton className="h-6 w-full bg-sidebar-accent/50" />
                  <Skeleton className="h-6 w-5/6 bg-sidebar-accent/50" />
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="p-4 space-y-3 relative z-0">
                  {logs.map((log) => {
                    const device = devices?.find(d => d.id === log.deviceId);
                    return (
                      <div key={log.id} className="flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0" data-testid={`log-row-${log.id}`}>
                        <div className="flex items-center justify-between opacity-60 text-xs">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className="truncate max-w-[150px]">{device?.name || log.deviceId.substring(0,8)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className={`px-1 rounded text-[10px] uppercase font-bold mt-0.5 shrink-0 ${
                            log.level === 'error' ? 'bg-destructive/20 text-destructive' : 
                            log.level === 'warn' ? 'bg-amber-500/20 text-amber-500' : 
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {log.level.substring(0,4)}
                          </span>
                          <span className="text-gray-300 break-words line-clamp-2">{log.message}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 p-6">
                  <Terminal className="h-10 w-10 mb-2 opacity-20" />
                  <p>Log stream empty</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}