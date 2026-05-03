import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, ErrorType } from "@workspace/api-client-react";
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
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data.token);
        },
        onError: (error: ErrorType<unknown>) => {
          const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          toast({
            variant: "destructive",
            title: "Login failed",
            description: msg || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
      
      <div className="w-full max-w-md z-10">
        <div className="bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
          <div className="p-8 pb-6 border-b border-border/50 bg-secondary/30 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl mx-auto flex items-center justify-center mb-6 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
              <MonitorSmartphone className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">MDM Operations</h1>
            <p className="text-sm text-muted-foreground font-mono">AUTHORIZED PERSONNEL ONLY</p>
          </div>
          
          <div className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Operator ID (Email)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin@demo.com" 
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
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Passcode</FormLabel>
                      </div>
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
                    disabled={loginMutation.isPending}
                    data-testid="button-submit-login"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      "Establish Uplink"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
          
          <div className="p-4 bg-secondary/50 border-t border-border text-center text-sm">
            <span className="text-muted-foreground">New tenant?</span>{" "}
            <Link href="/register" className="text-primary hover:underline font-medium ml-1" data-testid="link-register">
              Initialize workspace
            </Link>
          </div>
        </div>
        
        <div className="mt-8 flex justify-between items-center text-xs text-muted-foreground/50 font-mono px-2">
          <span>SYS.VER.0.1.0</span>
          <span>CONN:SECURE</span>
        </div>
      </div>
    </div>
  );
}