import { Switch, Route, Link, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { MessageCircle, Brain } from "lucide-react";
import ChatPage from "@/pages/chat";
import AutonomousPage from "@/pages/autonomous";
import NotFound from "@/pages/not-found";

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">Casper AI</h1>
          <div className="flex space-x-2">
            <Link href="/">
              <Button 
                variant={location === '/' || location.startsWith('/chat') ? 'default' : 'ghost'} 
                size="sm"
                className="flex items-center gap-2"
                data-testid="nav-chat"
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </Button>
            </Link>
            <Link href="/autonomous">
              <Button 
                variant={location === '/autonomous' ? 'default' : 'ghost'} 
                size="sm"
                className="flex items-center gap-2"
                data-testid="nav-autonomous"
              >
                <Brain className="h-4 w-4" />
                Autonomous
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="pt-14">
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/chat/:id?" component={ChatPage} />
          <Route path="/autonomous" component={AutonomousPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
