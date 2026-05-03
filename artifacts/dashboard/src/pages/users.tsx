import { useState } from "react";
import { useGetUsers, useCreateUser, useDeleteUser, getGetUsersQueryKey, ErrorType, CreateUserRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash, Users as UsersIcon, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";

const userSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "operator"]),
});

export default function Users() {
  const { user } = useAuth();
  
  if (user && user.role !== 'admin') {
    return <Redirect to="/dashboard" />;
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: users, isLoading } = useGetUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { email: "", password: "", role: "operator" },
  });

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    createUser.mutate(
      { data: values as CreateUserRequest },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
          toast({ title: "User provisioned successfully" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: (error: ErrorType<unknown>) => {
          const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          toast({ 
            variant: "destructive", 
            title: "Failed to provision user",
            description: msg || "Unknown error occurred."
          });
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    if (user?.id === id) {
      toast({ variant: "destructive", title: "Cannot decommission yourself" });
      return;
    }
    
    if (confirm("Are you sure you want to revoke access for this operator?")) {
      deleteUser.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
            toast({ title: "Operator access revoked" });
          },
          onError: () => toast({ variant: "destructive", title: "Failed to revoke access" })
        }
      );
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Access Control</h1>
            <p className="text-muted-foreground font-mono text-sm">Manage operator credentials and clearance</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) form.reset();
          }}>
            <DialogTrigger asChild>
              <Button className="font-mono uppercase tracking-wider" data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" />
                Issue Credentials
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">Issue New Credentials</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Operator Email</FormLabel>
                        <FormControl>
                          <Input placeholder="operator@demo.com" className="font-mono" {...field} data-testid="input-user-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Initial Passcode</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" className="font-mono" {...field} data-testid="input-user-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Clearance Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-mono">
                              <SelectValue placeholder="Select clearance" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border font-mono">
                            <SelectItem value="operator">OPERATOR</SelectItem>
                            <SelectItem value="admin" className="text-primary font-bold">ADMIN</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createUser.isPending} data-testid="button-save-user">
                      {createUser.isPending ? 'Processing...' : 'Execute'}
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
                <TableHead className="font-mono text-xs uppercase tracking-wider">Operator Identity</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Clearance</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Provisioned</TableHead>
                <TableHead className="text-right w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><div className="h-5 w-48 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-mono">
                    NO OPERATORS FOUND
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((u) => (
                  <TableRow key={u.id} className="border-border hover:bg-secondary/30 transition-colors" data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-mono">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono uppercase text-[10px] ${u.role === 'admin' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                        {u.role === 'admin' && <ShieldAlert className="w-3 h-3 mr-1" />}
                        {u.role === 'operator' && <UsersIcon className="w-3 h-3 mr-1" />}
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right">
                      {user?.id !== u.id && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(u.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Revoke Access"
                          data-testid={`button-delete-user-${u.id}`}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      )}
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