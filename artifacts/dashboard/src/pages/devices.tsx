import { useState, useEffect } from "react";
import { useGetDevices, useCreateDevice, useDeleteDevice, useUpdateDevice, getGetDevicesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Search, MoreVertical, Trash, Edit, MonitorSmartphone, Wifi, WifiOff, HelpCircle, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { socket } from "@/lib/socket";

const deviceSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  ip: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Dirección IP inválida"),
});

export default function Devices() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: devices, isLoading } = useGetDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();

  useEffect(() => {
    socket.connect();
    socket.on('device:status', () => {
      queryClient.invalidateQueries({ queryKey: getGetDevicesQueryKey() });
    });
    return () => {
      socket.off('device:status');
      socket.disconnect();
    };
  }, [queryClient]);

  const form = useForm<z.infer<typeof deviceSchema>>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { name: "", ip: "" },
  });

  const filteredDevices = devices?.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.ip.includes(search);
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const onSubmit = (values: z.infer<typeof deviceSchema>) => {
    if (editingDevice) {
      updateDevice.mutate(
        { id: editingDevice, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetDevicesQueryKey() });
            toast({ title: "Dispositivo actualizado correctamente" });
            setIsCreateOpen(false);
            setEditingDevice(null);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Error al actualizar dispositivo" })
        }
      );
    } else {
      createDevice.mutate(
        { data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetDevicesQueryKey() });
            toast({ title: "Dispositivo registrado correctamente" });
            setIsCreateOpen(false);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Error al registrar dispositivo" })
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("¿Estás seguro de que deseas dar de baja este dispositivo?")) {
      deleteDevice.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetDevicesQueryKey() });
            toast({ title: "Dispositivo dado de baja" });
          },
          onError: () => toast({ variant: "destructive", title: "Error al dar de baja el dispositivo" })
        }
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': 
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-mono"><Wifi className="w-3 h-3 mr-1" /> EN LÍNEA</Badge>;
      case 'offline': 
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-mono"><WifiOff className="w-3 h-3 mr-1" /> DESCONECTADO</Badge>;
      default: 
        return <Badge className="bg-muted text-muted-foreground border-border font-mono"><HelpCircle className="w-3 h-3 mr-1" /> DESCONOCIDO</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Flota de Dispositivos</h1>
            <p className="text-muted-foreground font-mono text-sm">Gestionar y monitorear equipos Android TV</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setEditingDevice(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="font-mono uppercase tracking-wider" data-testid="button-add-device">
                <Plus className="w-4 h-4 mr-2" />
                Registrar Equipo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">{editingDevice ? 'Editar Equipo' : 'Registrar Nuevo Equipo'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Nombre del Equipo</FormLabel>
                        <FormControl>
                          <Input placeholder="Pantalla Lobby 1" className="font-mono" {...field} data-testid="input-device-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Dirección IPv4</FormLabel>
                        <FormControl>
                          <Input placeholder="192.168.1.100" className="font-mono" {...field} data-testid="input-device-ip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createDevice.isPending || updateDevice.isPending} data-testid="button-save-device">
                      {createDevice.isPending || updateDevice.isPending ? 'Procesando...' : 'Guardar'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center space-x-2 bg-card border border-border rounded-md px-3 py-2 flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input 
              className="border-0 focus-visible:ring-0 px-0 h-auto font-mono text-sm bg-transparent" 
              placeholder="Buscar por nombre o IP..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-devices"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] font-mono text-sm bg-card border-border" data-testid="select-status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border font-mono">
              <SelectItem value="all">TODOS LOS ESTADOS</SelectItem>
              <SelectItem value="online" className="text-emerald-500">EN LÍNEA</SelectItem>
              <SelectItem value="offline" className="text-destructive">DESCONECTADO</SelectItem>
              <SelectItem value="unknown" className="text-muted-foreground">DESCONOCIDO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider w-[300px]">Nombre</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Estado</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Dirección IP</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Última Conexión</TableHead>
                <TableHead className="text-right w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><div className="h-5 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : filteredDevices?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground font-mono">
                    SIN DISPOSITIVOS
                  </TableCell>
                </TableRow>
              ) : (
                filteredDevices?.map((device) => (
                  <TableRow key={device.id} className="border-border hover:bg-secondary/30 transition-colors group" data-testid={`row-device-${device.id}`}>
                    <TableCell className="font-medium">
                      <Link href={`/devices/${device.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                        <MonitorSmartphone className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                        {device.name}
                      </Link>
                    </TableCell>
                    <TableCell>{getStatusBadge(device.status)}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{device.ip}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true, locale: es }) : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-device-menu-${device.id}`}>
                            <span className="sr-only">Abrir menú</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border font-mono text-sm">
                          <DropdownMenuItem 
                            onClick={() => {
                              setEditingDevice(device.id);
                              form.reset({ name: device.name, ip: device.ip });
                              setIsCreateOpen(true);
                            }}
                            className="cursor-pointer focus:bg-secondary"
                            data-testid={`menu-edit-${device.id}`}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(device.id)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            data-testid={`menu-delete-${device.id}`}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Dar de baja
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
