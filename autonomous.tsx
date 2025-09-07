import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Brain, 
  Globe, 
  FileText, 
  Shield, 
  Server, 
  Eye, 
  Upload,
  Download,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface SystemStats {
  memory: {
    shards: Record<string, number>;
    total: number;
  };
  scanning: {
    scannedUrls: number;
    isScanning: boolean;
    queueSize: number;
  };
  operations: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  vault: {
    providers: number;
    healthy: boolean;
  };
  override: {
    active: boolean;
    timestamp?: string;
    reason?: string;
  };
}

export default function AutonomousPage() {
  const queryClient = useQueryClient();
  const [selectedShard, setSelectedShard] = useState('all');
  const [scanUrls, setScanUrls] = useState('');
  const [processText, setProcessText] = useState('');

  // Fetch system stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/autonomous/stats'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Override control mutation
  const overrideMutation = useMutation({
    mutationFn: async (data: { active: boolean; reason?: string }) => 
      apiRequest('/api/autonomous/override', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/autonomous/stats'] });
    },
  });

  // Web scanning mutation
  const scanMutation = useMutation({
    mutationFn: async (data: { urls: string[]; depth?: number }) =>
      apiRequest('/api/autonomous/scan/start', { method: 'POST', body: data }),
    onSuccess: () => {
      setScanUrls('');
      queryClient.invalidateQueries({ queryKey: ['/api/autonomous/operations'] });
    },
  });

  // Text processing mutation
  const processTextMutation = useMutation({
    mutationFn: async (data: { text: string; source?: string }) =>
      apiRequest('/api/autonomous/multimodal/process-text', { method: 'POST', body: data }),
    onSuccess: () => {
      setProcessText('');
      queryClient.invalidateQueries({ queryKey: ['/api/autonomous/knowledge'] });
    },
  });

  // Knowledge search
  const { data: knowledge } = useQuery({
    queryKey: ['/api/autonomous/knowledge', selectedShard],
    queryFn: () => apiRequest(`/api/autonomous/knowledge?shard=${selectedShard !== 'all' ? selectedShard : ''}`),
  });

  // Recent operations
  const { data: operations } = useQuery({
    queryKey: ['/api/autonomous/operations'],
    queryFn: () => apiRequest('/api/autonomous/operations?limit=10'),
  });

  // Vault stats
  const { data: vaultStats } = useQuery({
    queryKey: ['/api/autonomous/vault/stats'],
  });

  const handleOverrideToggle = () => {
    if (!stats) return;
    const newActive = !stats.override.active;
    const reason = newActive ? 'Manual activation' : 'Manual deactivation';
    overrideMutation.mutate({ active: newActive, reason });
  };

  const handleStartScan = () => {
    if (!scanUrls.trim()) return;
    const urls = scanUrls.split('\n').map(url => url.trim()).filter(url => url);
    scanMutation.mutate({ urls, depth: 2 });
  };

  const handleProcessText = () => {
    if (!processText.trim()) return;
    processTextMutation.mutate({ text: processText, source: 'manual-input' });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load autonomous system stats</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="autonomous-dashboard">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Autonomous System</h1>
          <p className="text-muted-foreground">
            Monitor and control all autonomous AI capabilities
          </p>
        </div>
        
        {/* Override Control */}
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <Shield className={`h-5 w-5 ${stats.override.active ? 'text-green-500' : 'text-red-500'}`} />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Override Control</span>
              <span className="text-xs text-muted-foreground">
                {stats.override.active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <Switch
              checked={stats.override.active}
              onCheckedChange={handleOverrideToggle}
              disabled={overrideMutation.isPending}
              data-testid="switch-override"
            />
          </div>
          {stats.override.reason && (
            <p className="text-xs text-muted-foreground mt-2">{stats.override.reason}</p>
          )}
        </Card>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-memory-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory System</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-memory-total">
              {stats.memory.total}
            </div>
            <p className="text-xs text-muted-foreground">
              Knowledge entries across {Object.keys(stats.memory.shards).length} shards
            </p>
            <div className="mt-2 space-y-1">
              {Object.entries(stats.memory.shards).map(([shard, count]) => (
                <div key={shard} className="flex justify-between text-xs">
                  <span>{shard}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-scanning-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Web Scanning</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-scanned-count">
              {stats.scanning.scannedUrls}
            </div>
            <p className="text-xs text-muted-foreground">URLs scanned</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={stats.scanning.isScanning ? 'default' : 'secondary'}>
                {stats.scanning.isScanning ? 'Scanning' : 'Idle'}
              </Badge>
              {stats.scanning.queueSize > 0 && (
                <Badge variant="outline">{stats.scanning.queueSize} queued</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-operations-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operations</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-operations-active">
              {stats.operations.running + stats.operations.pending}
            </div>
            <p className="text-xs text-muted-foreground">Active operations</p>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="text-green-600">{stats.operations.completed}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed</span>
                <span className="text-red-600">{stats.operations.failed}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-vault-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vault</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-vault-providers">
              {stats.vault.providers}
            </div>
            <p className="text-xs text-muted-foreground">Stored providers</p>
            <div className="mt-2">
              <Badge variant={stats.vault.healthy ? 'default' : 'destructive'}>
                {stats.vault.healthy ? 'Healthy' : 'Unhealthy'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Interface Tabs */}
      <Tabs defaultValue="knowledge" className="space-y-4">
        <TabsList>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="scanning" data-testid="tab-scanning">Web Scanning</TabsTrigger>
          <TabsTrigger value="processing" data-testid="tab-processing">Multi-Modal</TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
          <TabsTrigger value="vault" data-testid="tab-vault">Vault</TabsTrigger>
        </TabsList>

        {/* Knowledge Management */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Knowledge Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <select
                  value={selectedShard}
                  onChange={(e) => setSelectedShard(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                  data-testid="select-shard"
                >
                  <option value="all">All Shards</option>
                  <option value="text">Text</option>
                  <option value="images">Images</option>
                  <option value="audio">Audio</option>
                  <option value="code">Code</option>
                  <option value="default">Default</option>
                </select>
                <Button variant="outline" size="sm" data-testid="button-refresh-knowledge">
                  Refresh
                </Button>
              </div>
              
              <ScrollArea className="h-64 w-full border rounded-md p-4">
                {knowledge && knowledge.length > 0 ? (
                  <div className="space-y-2">
                    {knowledge.map((entry: any) => (
                      <div key={entry.id} className="p-2 border rounded text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <Badge variant="outline">{entry.shard}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="truncate" data-testid={`knowledge-entry-${entry.id}`}>
                          {entry.text}
                        </p>
                        {entry.source && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Source: {entry.source}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No knowledge entries found
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Web Scanning */}
        <TabsContent value="scanning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Web Scanning Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!stats.override.active && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Override must be active to start web scanning
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">URLs to Scan (one per line)</label>
                <Textarea
                  value={scanUrls}
                  onChange={(e) => setScanUrls(e.target.value)}
                  placeholder="https://example.com&#10;https://another-site.com"
                  className="min-h-24"
                  disabled={!stats.override.active}
                  data-testid="textarea-scan-urls"
                />
              </div>
              
              <Button
                onClick={handleStartScan}
                disabled={!stats.override.active || !scanUrls.trim() || scanMutation.isPending}
                data-testid="button-start-scan"
              >
                {scanMutation.isPending ? 'Starting...' : 'Start Scan'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Multi-Modal Processing */}
        <TabsContent value="processing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Multi-Modal Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!stats.override.active && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Override must be active to process content
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Text to Process</label>
                <Textarea
                  value={processText}
                  onChange={(e) => setProcessText(e.target.value)}
                  placeholder="Enter text to analyze and add to knowledge base..."
                  className="min-h-32"
                  disabled={!stats.override.active}
                  data-testid="textarea-process-text"
                />
              </div>
              
              <Button
                onClick={handleProcessText}
                disabled={!stats.override.active || !processText.trim() || processTextMutation.isPending}
                data-testid="button-process-text"
              >
                {processTextMutation.isPending ? 'Processing...' : 'Process Text'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operations Monitor */}
        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Operations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 w-full">
                {operations && operations.length > 0 ? (
                  <div className="space-y-2">
                    {operations.map((op: any) => (
                      <div key={op.id} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{op.type}</Badge>
                            {op.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                            {op.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                            {op.status === 'running' && <Activity className="h-4 w-4 text-blue-500 animate-spin" />}
                            {op.status === 'pending' && <Clock className="h-4 w-4 text-orange-500" />}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Started: {new Date(op.startedAt).toLocaleString()}
                          </p>
                          {op.error && (
                            <p className="text-xs text-red-600 mt-1">{op.error}</p>
                          )}
                        </div>
                        {op.progress > 0 && (
                          <div className="w-24">
                            <Progress value={op.progress} className="h-2" />
                            <p className="text-xs text-center mt-1">{op.progress}%</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No recent operations
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vault Management */}
        <TabsContent value="vault" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Credential Vault
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vaultStats ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Total Providers:</span>
                    <Badge>{vaultStats.totalProviders}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Vault Status:</span>
                    <Badge variant={vaultStats.vaultHealthy ? 'default' : 'destructive'}>
                      {vaultStats.vaultHealthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Stored Providers:</h4>
                    {vaultStats.providers?.length > 0 ? (
                      vaultStats.providers.map((provider: any) => (
                        <div key={provider.name} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <span className="font-medium">{provider.name}</span>
                            <p className="text-xs text-muted-foreground">{provider.type}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(provider.lastUpdated).toLocaleDateString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No providers stored</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Loading vault stats...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}