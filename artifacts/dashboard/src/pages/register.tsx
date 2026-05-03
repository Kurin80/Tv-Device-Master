import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, ErrorType } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MonitorSmartphone, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  tenantName: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export default function Register() {
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tenantName: "",
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data.token);
        },
        onError: (error: ErrorType<unknown>) => {
          const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          toast({
            variant: "destructive",
            title: "Error al registrar",
            description: msg || "No se pudo crear la organización.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
      
      <div className="w-full max-w-md z-10">
        <div className="bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
          <div className="p-6 pb-4 border-b border-border/50 bg-secondary/30 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.2)] shrink-0">
              <MonitorSmartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Registrar Organización</h1>
              <p className="text-xs text-muted-foreground font-mono">NUEVO TENANT</p>
            </div>
          </div>
          
          <div className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="tenantName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Nombre de la Organización</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Mi Empresa S.A." 
                          {...field} 
                          className="bg-background font-mono h-11"
                          data-testid="input-tenant-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Correo del Administrador</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin@empresa.com" 
                          {...field} 
                          className="bg-background font-mono h-11"
                          data-testid="input-email"
                        />
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
                      <FormLabel className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Contraseña</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          {...field} 
                          className="bg-background font-mono h-11 tracking-widest"
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="pt-2">
                  <Button 
                    type="submit" 
                    className="w-full h-11 font-mono uppercase tracking-wider font-bold" 
                    disabled={registerMutation.isPending}
                    data-testid="button-submit-register"
                  >
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      "Registrar"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
          
          <div className="p-4 bg-secondary/50 border-t border-border text-center text-sm">
            <span className="text-muted-foreground">¿Ya tienes cuenta?</span>{" "}
            <Link href="/login" className="text-primary hover:underline font-medium ml-1" data-testid="link-login">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
