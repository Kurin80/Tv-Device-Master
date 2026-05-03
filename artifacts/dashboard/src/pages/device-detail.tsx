import { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { 
  useGetDevice, 
  useGetDeviceCommands, 
  useGetDeviceApps, 
  useGetDeviceLogs,
  usePingDevice,
  useSendCommand,
  getGetDeviceQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Terminal, Activity, MonitorSmartphone, Power, Home, 
  ArrowLeft, RotateCcw, PlaySquare, Download, Lock, Package,
  Wifi, WifiOff, HelpCircle, Clock, CheckCircle2, XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { socket } from "@/lib/socket";
import { formatDistanceToNow } from "date-fns";

export default function DeviceDetail() {
  const [match, params] = useRoute("/devices/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: device, isLoading } = useGetDevice(id, { 
    query: { enabled: !!id } 
  });
  
  const { data: commands } = useGetDeviceCommands(id, {
    query: { enabled: !!id }
  });
  
  const { data: apps } = useGetDeviceApps(id, {
    query: { enabled: !!id }
  });
  
  const { data: initialLogs } = useGetDeviceLogs(id, { limit: 50 }, {
    query: { enabled: !!id }
  });

  const [liveLogs, setLiveLogs] = useState<any[]>([]);

  useEffect(() => {
    if (initialLogs) {
      setLiveLogs(initialLogs);
    }
  }, [initialLogs]);

  useEffect(() => {
    if (!id) return;

    socket.connect();
    
    socket.on('device:status', (data) => {
      if (data.deviceId === id) {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(id) });
      }
    });

    socket.on('device:log', (data) => {
      if (data.deviceId === id) {
        setLiveLogs(prev => [data, ...prev].slice(0, 100));
      }
    });

    socket.on('command:result', (data) => {
      if (data.deviceId === id) {
        queryClient.invalidateQueries({ queryKey: ["/api/devices", id, "commands"] });
        toast({
          title: "Command Executed",
          description: `Status: ${data.status}`,
          variant: data.status === 'success' ? 'default' : 'destructive'
        });
      }
    });

    return () => {
      socket.off('device:status');
      socket.off('device:log');
      socket.off('command:result');
      socket.disconnect();
    };
  }, [id, queryClient, toast]);

  const pingDevice = usePingDevice();
  const sendCommand = useSendCommand();

  const handlePing = () => {
    pingDevice.mutate(
      { data: { deviceId: id } },
      {
        onSuccess: (res) => {
          toast({ 
            title: "Ping Successful", 
            description: `Device is ${res.status}`,
            variant: res.online ? 'default' : 'destructive'
          });
          queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(id) });
        },
        onError: () => toast({ variant: "destructive", title: "Ping Failed" })
      }
    );
  };

  const handleCommand = (action: any, param?: string) => {
    sendCommand.mutate(
      { data: { deviceId: id, action, param } },
      {
        onSuccess: () => {
          toast({ title: "Command dispatched" });
          queryClient.invalidateQueries({ queryKey: ["/api/devices", id, "commands"] });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to dispatch command" })
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'offline': return 'text-destructive bg-destructive/10 border-destructive/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getCommandStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'running': return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading || !device) return <Layout><div className="p-8 text-center font-mono">LOADING_TELEMETRY...</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center bg-card p-6 rounded-lg border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl border ${device.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-muted border-border'}`}>
              <MonitorSmartphone className={`h-8 w-8 ${device.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                {device.name}
                <Badge variant="outline" className={`font-mono uppercase text-xs ${getStatusColor(device.status)}`}>
                  {device.status === 'online' && <Wifi className="w-3 h-3 mr-1" />}
                  {device.status === 'offline' && <WifiOff className="w-3 h-3 mr-1" />}
                  {device.status === 'unknown' && <HelpCircle className="w-3 h-3 mr-1" />}
                  {device.status}
                </Badge>
              </h1>
              <p className="text-muted-foreground font-mono text-sm mt-1">IP: {device.ip} • LAST SEEN: {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true }).toUpperCase() : 'NEVER'}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePing} disabled={pingDevice.isPending} className="font-mono text-xs uppercase" data-testid="button-ping">
              <Activity className={`w-4 h-4 mr-2 ${pingDevice.isPending ? 'animate-spin' : ''}`} />
              Ping
            </Button>
            <Button 
              onClick={() => handleCommand('reboot')} 
              disabled={device.status !== 'online' || sendCommand.isPending}
              variant="destructive"
              className="font-mono text-xs uppercase"
              data-testid="button-reboot"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reboot
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions Panel */}
          <div className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 border-b border-border bg-secondary/20">
                <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Remote Operations
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('screen_on')} disabled={device.status !== 'online'} data-testid="cmd-screen-on">
                    <Power className="w-3 h-3 mr-2 text-emerald-500" /> Screen On
                  </Button>
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('screen_off')} disabled={device.status !== 'online'} data-testid="cmd-screen-off">
                    <Power className="w-3 h-3 mr-2 text-destructive" /> Screen Off
                  </Button>
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('home')} disabled={device.status !== 'online'} data-testid="cmd-home">
                    <Home className="w-3 h-3 mr-2" /> Home
                  </Button>
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('back')} disabled={device.status !== 'online'} data-testid="cmd-back">
                    <ArrowLeft className="w-3 h-3 mr-2" /> Back
                  </Button>
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('kiosk_enable')} disabled={device.status !== 'online'} data-testid="cmd-kiosk">
                    <Lock className="w-3 h-3 mr-2 text-amber-500" /> Enable Kiosk
                  </Button>
                  <Button variant="secondary" className="justify-start font-mono text-xs" onClick={() => handleCommand('sync_apps')} disabled={device.status !== 'online'} data-testid="cmd-sync">
                    <Activity className="w-3 h-3 mr-2 text-blue-500" /> Sync Apps
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm flex flex-col h-[400px]">
              <CardHeader className="pb-3 border-b border-border bg-secondary/20">
                <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Installed Packages
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-auto">
                <div className="divide-y divide-border">
                  {apps?.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground font-mono text-sm">NO_PACKAGES_FOUND</div>
                  ) : (
                    apps?.map(app => (
                      <div key={app.id} className="p-3 hover:bg-secondary/30 flex justify-between items-center group">
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm truncate">{app.appName || app.packageName}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{app.packageName}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 h-8 w-8 text-primary"
                          onClick={() => handleCommand('open_app', app.packageName)}
                          title="Launch App"
                        >
                          <PlaySquare className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs (Logs & History) */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="logs" className="h-full flex flex-col">
              <TabsList className="w-full justify-start bg-secondary border border-border rounded-lg p-1 h-auto">
                <TabsTrigger value="logs" className="font-mono uppercase text-xs py-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Live Telemetry
                </TabsTrigger>
                <TabsTrigger value="history" className="font-mono uppercase text-xs py-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Command History
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="logs" className="flex-1 mt-4">
                <Card className="border-sidebar-border shadow-sm h-[600px] flex flex-col bg-sidebar">
                  <CardHeader className="pb-3 border-b border-sidebar-border bg-sidebar-accent/50 flex flex-row items-center justify-between py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center gap-2 text-sidebar-foreground">
                      <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                      Stream Active
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-hidden bg-[#0A0E17] relative">
                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.2)_51%)] bg-[length:100%_4px] opacity-20 z-10" />
                    <ScrollArea className="h-full p-4 font-mono text-sm relative z-0">
                      {liveLogs.length === 0 ? (
                        <div className="text-muted-foreground/50 h-full flex items-center justify-center">AWAITING_DATA...</div>
                      ) : (
                        <div className="space-y-1">
                          {liveLogs.map((log, i) => (
                            <div key={log.id || i} className="flex gap-3 text-gray-300 border-b border-white/5 pb-1">
                              <span className="opacity-50 shrink-0 select-none">
                                {new Date(log.createdAt).toLocaleTimeString([], { hour12: false })}
                              </span>
                              <span className={`shrink-0 w-12 font-bold select-none ${
                                log.level === 'error' ? 'text-destructive' : 
                                log.level === 'warn' ? 'text-amber-500' : 'text-blue-400'
                              }`}>
                                {log.level.padEnd(5)}
                              </span>
                              <span className="break-all">{log.message}</span>
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="history" className="flex-1 mt-4">
                <Card className="border-border shadow-sm h-[600px] flex flex-col">
                  <CardContent className="p-0 flex-1 overflow-auto">
                    <div className="divide-y divide-border">
                      {commands?.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground font-mono">NO_COMMAND_HISTORY</div>
                      ) : (
                        commands?.map(cmd => (
                          <div key={cmd.id} className="p-4 hover:bg-secondary/20">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {getCommandStatusIcon(cmd.status)}
                                <span className="font-mono font-bold uppercase text-sm">{cmd.command}</span>
                              </div>
                              <span className="text-xs text-muted-foreground font-mono">
                                {new Date(cmd.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {cmd.response && (
                              <div className="bg-secondary/50 p-2 rounded text-xs font-mono mt-2 text-muted-foreground border border-border/50">
                                {cmd.response}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </Layout>
  );
}