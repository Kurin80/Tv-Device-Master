import { useState } from "react";
import { useGetAllLogs } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Terminal, Clock, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function Logs() {
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [search, setSearch] = useState("");
  
  const { data: logs, isLoading } = useGetAllLogs({ query: { limit: 200 } });

  const filteredLogs = logs?.filter(log => {
    const matchesLevel = filterLevel === "all" || log.level.toLowerCase() === filterLevel.toLowerCase();
    const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase()) || 
                          log.deviceId.toLowerCase().includes(search.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
            <p className="text-muted-foreground font-mono text-sm">Tenant-wide telemetry and event history</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search events..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[250px] font-mono text-sm bg-card border-border"
                data-testid="input-search-logs"
              />
            </div>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-[140px] font-mono text-sm bg-card border-border">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border font-mono">
                <SelectItem value="all">ALL_LEVELS</SelectItem>
                <SelectItem value="info" className="text-blue-500">INFO</SelectItem>
                <SelectItem value="warn" className="text-amber-500">WARN</SelectItem>
                <SelectItem value="error" className="text-destructive">ERROR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex-1 border-border shadow-sm bg-sidebar flex flex-col overflow-hidden">
          <CardHeader className="py-3 border-b border-sidebar-border bg-sidebar-accent/50 shrink-0">
            <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center gap-2 text-sidebar-foreground">
              <Terminal className="w-4 h-4 text-primary" />
              System Stream
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto bg-[#0A0E17] relative">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.2)_51%)] bg-[length:100%_4px] opacity-20 z-10" />
            
            <div className="min-w-[800px] relative z-0 p-4 font-mono text-sm">
              <div className="grid grid-cols-[180px_200px_80px_1fr] gap-4 text-white/40 mb-4 pb-2 border-b border-white/10 uppercase tracking-wider text-xs font-bold sticky top-0 bg-[#0A0E17]/90 backdrop-blur">
                <div>Timestamp</div>
                <div>Node ID</div>
                <div>Level</div>
                <div>Message</div>
              </div>
              
              <div className="space-y-1">
                {isLoading ? (
                  <div className="text-white/30 text-center py-8">LOADING_STREAM...</div>
                ) : filteredLogs?.length === 0 ? (
                  <div className="text-white/30 text-center py-8">NO_RECORDS_FOUND</div>
                ) : (
                  filteredLogs?.map((log) => (
                    <div key={log.id} className="grid grid-cols-[180px_200px_80px_1fr] gap-4 text-gray-300 py-1 hover:bg-white/5 border-b border-white/5 last:border-0" data-testid={`log-row-${log.id}`}>
                      <div className="opacity-60 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                      </div>
                      <div className="truncate opacity-80" title={log.deviceId}>{log.deviceId}</div>
                      <div className={`font-bold ${
                        log.level === 'error' ? 'text-destructive' : 
                        log.level === 'warn' ? 'text-amber-500' : 'text-blue-400'
                      }`}>
                        {log.level.toUpperCase()}
                      </div>
                      <div className="break-all">{log.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}