import { useState } from "react";
import { 
  useGetScheduledTasks, 
  useCreateScheduledTask, 
  useUpdateScheduledTask, 
  useDeleteScheduledTask,
  useGetDevices,
  getGetScheduledTasksQueryKey,
  ScheduledTask
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, MoreVertical, Trash, Edit, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ACTIONS = [
  { value: "reboot", label: "Reiniciar dispositivo" },
  { value: "screen_on", label: "Encender pantalla" },
  { value: "screen_off", label: "Apagar pantalla" },
  { value: "open_app", label: "Abrir aplicación" },
  { value: "sync_apps", label: "Sincronizar paquetes" },
  { value: "kiosk_enable", label: "Activar modo kiosco" },
  { value: "kiosk_disable", label: "Desactivar modo kiosco" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00`
}));

const DAY_OPTIONS = [
  { value: "*", label: "Todos los días" },
  { value: "1-5", label: "Lunes a Viernes" },
  { value: "6,0", label: "Fines de semana" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

const scheduleSchema = z.object({
  name: z.string().min(2, "El nombre de la tarea es requerido"),
  deviceId: z.string().optional(),
  hour: z.string().min(1, "La hora es requerida"),
  days: z.string().min(1, "Los días son requeridos"),
  action: z.string().min(1, "La acción es requerida"),
  actionParam: z.string().optional(),
  enabled: z.boolean().default(true),
});

type FormValues = z.infer<typeof scheduleSchema>;

function buildCron(hour: string, days: string): string {
  return `0 ${hour} * * ${days}`;
}

function parseCron(cron: string): { hour: string; days: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 5) {
    return { hour: parts[1] ?? "2", days: parts[4] ?? "*" };
  }
  return { hour: "2", days: "*" };
}

function describeCron(cron: string): string {
  const { hour, days } = parseCron(cron);
  const hourLabel = HOURS.find(h => h.value === hour)?.label ?? `${hour}:00`;
  const dayLabel = DAY_OPTIONS.find(d => d.value === days)?.label ?? days;
  return `${dayLabel} a las ${hourLabel}`;
}

export default function Schedule() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: tasks, isLoading } = useGetScheduledTasks();
  const { data: devices } = useGetDevices();
  
  const createTask = useCreateScheduledTask();
  const updateTask = useUpdateScheduledTask();
  const deleteTask = useDeleteScheduledTask();

  const form = useForm<FormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { name: "", hour: "2", days: "*", action: "reboot", enabled: true, deviceId: "all" },
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      name: values.name,
      cronExpression: buildCron(values.hour, values.days),
      action: values.action,
      actionParam: values.actionParam,
      enabled: values.enabled,
      deviceId: values.deviceId === "all" ? undefined : values.deviceId,
    };

    if (editingTask) {
      updateTask.mutate(
        { id: editingTask, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetScheduledTasksQueryKey() });
            toast({ title: "Rutina actualizada correctamente" });
            setIsCreateOpen(false);
            setEditingTask(null);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Error al actualizar rutina" })
        }
      );
    } else {
      createTask.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetScheduledTasksQueryKey() });
            toast({ title: "Rutina programada correctamente" });
            setIsCreateOpen(false);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Error al programar rutina" })
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta rutina?")) {
      deleteTask.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetScheduledTasksQueryKey() });
            toast({ title: "Rutina eliminada" });
          },
          onError: () => toast({ variant: "destructive", title: "Error al eliminar rutina" })
        }
      );
    }
  };

  const handleToggle = (task: ScheduledTask, enabled: boolean) => {
    const { id, tenantId: _t, createdAt: _c, ...rest } = task;
    const data = {
      ...rest,
      enabled,
      deviceId: rest.deviceId ?? undefined,
      actionParam: rest.actionParam ?? undefined,
    };
    updateTask.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetScheduledTasksQueryKey() });
        }
      }
    );
  };

  const selectedAction = form.watch("action");
  const needsParam = selectedAction === "open_app";

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rutinas Automatizadas</h1>
            <p className="text-muted-foreground font-mono text-sm">Programar acciones automáticas en los dispositivos</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setEditingTask(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="font-mono uppercase tracking-wider" data-testid="button-add-task">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Rutina
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">{editingTask ? 'Editar Rutina' : 'Crear Rutina Automática'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Nombre de la Rutina</FormLabel>
                        <FormControl>
                          <Input placeholder="Reinicio Nocturno" className="font-mono" {...field} data-testid="input-task-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="deviceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Dispositivo Objetivo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "all"}>
                          <FormControl>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue placeholder="Seleccionar dispositivo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="all">TODOS LOS DISPOSITIVOS</SelectItem>
                            {devices?.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hour"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Hora de Ejecución</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono text-sm" data-testid="select-task-hour">
                                <SelectValue placeholder="Hora" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-card border-border font-mono max-h-60">
                              {HOURS.map(h => (
                                <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Días</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono text-sm" data-testid="select-task-days">
                                <SelectValue placeholder="Días" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-card border-border font-mono">
                              {DAY_OPTIONS.map(d => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="action"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Acción</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue placeholder="Seleccionar acción" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border font-mono text-sm">
                            {ACTIONS.map(a => (
                              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {needsParam && (
                    <FormField
                      control={form.control}
                      name="actionParam"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Nombre del Paquete</FormLabel>
                          <FormControl>
                            <Input placeholder="com.example.app" className="font-mono" {...field} data-testid="input-task-param" />
                          </FormControl>
                          <FormDescription className="text-xs font-mono">
                            Nombre del paquete Android a abrir
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-secondary/20 mt-2">
                        <div className="space-y-0.5">
                          <FormLabel className="font-mono text-sm uppercase">Estado de la Rutina</FormLabel>
                          <div className="text-xs text-muted-foreground font-mono">Activar/desactivar esta programación</div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter>
                    <Button type="submit" disabled={createTask.isPending || updateTask.isPending} data-testid="button-save-task">
                      {createTask.isPending || updateTask.isPending ? 'Procesando...' : 'Guardar Rutina'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider w-[60px]">Activo</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Nombre</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Dispositivo</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Programación</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Acción</TableHead>
                <TableHead className="text-right w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><div className="h-5 w-10 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-28 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : tasks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono">
                    SIN RUTINAS CONFIGURADAS
                  </TableCell>
                </TableRow>
              ) : (
                tasks?.map((task) => (
                  <TableRow key={task.id} className={`border-border hover:bg-secondary/30 transition-colors ${!task.enabled ? 'opacity-50' : ''}`} data-testid={`row-task-${task.id}`}>
                    <TableCell>
                      <Switch 
                        checked={task.enabled} 
                        onCheckedChange={(c) => handleToggle(task, c)} 
                        className="scale-75"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-muted-foreground" />
                        {task.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {task.deviceId ? devices?.find(d => d.id === task.deviceId)?.name || task.deviceId : "Todos"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="font-mono tracking-widest bg-secondary/50 text-[10px] w-fit">
                          {task.cronExpression}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">{describeCron(task.cronExpression)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs uppercase text-primary">{ACTIONS.find(a => a.value === task.action)?.label ?? task.action}</span>
                        {task.actionParam && <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">{task.actionParam}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-task-menu-${task.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border font-mono text-sm">
                          <DropdownMenuItem 
                            onClick={() => {
                              const { hour, days } = parseCron(task.cronExpression);
                              setEditingTask(task.id);
                              form.reset({ 
                                name: task.name, 
                                hour,
                                days,
                                action: task.action,
                                actionParam: task.actionParam || "",
                                enabled: task.enabled,
                                deviceId: task.deviceId || "all"
                              });
                              setIsCreateOpen(true);
                            }}
                            className="cursor-pointer focus:bg-secondary"
                            data-testid={`menu-edit-task-${task.id}`}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(task.id)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            data-testid={`menu-delete-task-${task.id}`}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Eliminar
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
