import { useState } from "react";
import { 
  useGetScheduledTasks, 
  useCreateScheduledTask, 
  useUpdateScheduledTask, 
  useDeleteScheduledTask,
  useGetDevices
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, MoreVertical, Trash, Edit, CalendarClock, PlaySquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const scheduleSchema = z.object({
  name: z.string().min(2, "Task name required"),
  deviceId: z.string().optional(),
  cronExpression: z.string().min(5, "Cron expression required"),
  action: z.string().min(1, "Action required"),
  actionParam: z.string().optional(),
  enabled: z.boolean().default(true),
});

const ACTIONS = [
  { value: "reboot", label: "Reboot Device" },
  { value: "screen_on", label: "Screen On" },
  { value: "screen_off", label: "Screen Off" },
  { value: "open_app", label: "Launch App" },
  { value: "sync_apps", label: "Sync Packages" }
];

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

  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { name: "", cronExpression: "0 2 * * *", action: "reboot", enabled: true, deviceId: "all" },
  });

  const onSubmit = (values: z.infer<typeof scheduleSchema>) => {
    const payload = {
      ...values,
      deviceId: values.deviceId === "all" ? undefined : values.deviceId
    };

    if (editingTask) {
      updateTask.mutate(
        { id: editingTask, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/scheduled-tasks"] });
            toast({ title: "Schedule updated successfully" });
            setIsCreateOpen(false);
            setEditingTask(null);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Failed to update schedule" })
        }
      );
    } else {
      createTask.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/scheduled-tasks"] });
            toast({ title: "Task scheduled successfully" });
            setIsCreateOpen(false);
            form.reset();
          },
          onError: () => toast({ variant: "destructive", title: "Failed to schedule task" })
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to remove this scheduled routine?")) {
      deleteTask.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/scheduled-tasks"] });
            toast({ title: "Routine removed" });
          },
          onError: () => toast({ variant: "destructive", title: "Failed to remove routine" })
        }
      );
    }
  };

  const handleToggle = (task: any, enabled: boolean) => {
    updateTask.mutate(
      { id: task.id, data: { ...task, enabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/scheduled-tasks"] });
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
            <h1 className="text-3xl font-bold tracking-tight">Automated Routines</h1>
            <p className="text-muted-foreground font-mono text-sm">Configure CRON-based execution schedules</p>
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
                New Routine
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">{editingTask ? 'Modify Routine' : 'Create Automation Routine'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Routine Designation</FormLabel>
                        <FormControl>
                          <Input placeholder="Nightly Reboot" className="font-mono" {...field} data-testid="input-task-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="deviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Target Scope</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value || "all"}>
                            <FormControl>
                              <SelectTrigger className="font-mono text-sm">
                                <SelectValue placeholder="Select target" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="all">ALL NODES</SelectItem>
                              {devices?.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="cronExpression"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">CRON Expression</FormLabel>
                          <FormControl>
                            <Input placeholder="0 2 * * *" className="font-mono tracking-widest" {...field} data-testid="input-task-cron" />
                          </FormControl>
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
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Execution Payload</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue placeholder="Select payload" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border font-mono text-sm">
                            {ACTIONS.map(a => (
                              <SelectItem key={a.value} value={a.value}>{a.label.toUpperCase()}</SelectItem>
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
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Payload Parameter (Package Name)</FormLabel>
                          <FormControl>
                            <Input placeholder="com.example.app" className="font-mono" {...field} data-testid="input-task-param" />
                          </FormControl>
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
                          <FormLabel className="font-mono text-sm uppercase">Routine Status</FormLabel>
                          <div className="text-xs text-muted-foreground font-mono">Enable/disable this schedule</div>
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
                      {createTask.isPending || updateTask.isPending ? 'Processing...' : 'Commit Routine'}
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
                <TableHead className="font-mono text-xs uppercase tracking-wider w-[60px]">Status</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Designation</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Target</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">CRON</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Payload</TableHead>
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
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-28 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : tasks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono">
                    NO ROUTINES CONFIGURED
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
                      {task.deviceId ? devices?.find(d => d.id === task.deviceId)?.name || task.deviceId : "ALL NODES"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono tracking-widest bg-secondary/50">
                        {task.cronExpression}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs uppercase text-primary">{task.action}</span>
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
                              setEditingTask(task.id);
                              form.reset({ 
                                name: task.name, 
                                cronExpression: task.cronExpression,
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
                            Modify
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(task.id)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            data-testid={`menu-delete-task-${task.id}`}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Remove
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