import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, Settings, Download, Trash2 } from "lucide-react";
import Message from "@/components/message";
import InputArea from "@/components/input-area";
import { useToast } from "@/hooks/use-toast";
import type { Message as MessageType } from "@shared/schema";

interface ChatAreaProps {
  conversationId?: string;
  messages: MessageType[];
  selectedModel: string;
  selectedMode: string;
  isConnected: boolean;
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (message: string, conversationId: string, model?: string, mode?: string) => void;
  onToggleSidebar: () => void;
  showSidebarToggle: boolean;
}

export default function ChatArea({
  conversationId,
  messages,
  selectedModel,
  selectedMode,
  isConnected,
  isStreaming,
  streamingContent,
  onSendMessage,
  onToggleSidebar,
  showSidebarToggle,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSendMessage = () => {
    if (!input.trim() || !conversationId || isStreaming) return;

    onSendMessage(input, conversationId, selectedModel, selectedMode);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    // TODO: Implement clear chat functionality
    toast({
      title: "Clear chat",
      description: "This feature will be implemented soon.",
    });
  };

  const handleExportChat = () => {
    // TODO: Implement export functionality
    toast({
      title: "Export chat",
      description: "This feature will be implemented soon.",
    });
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {showSidebarToggle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="lg:hidden"
              data-testid="button-toggle-sidebar"
            >
              <Menu className="w-4 h-4" />
            </Button>
          )}
          
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium" data-testid="text-connection-status">
              {selectedModel} {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportChat}
            disabled={!conversationId || messages.length === 0}
            data-testid="button-export-chat"
          >
            <Download className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            disabled={!conversationId || messages.length === 0}
            data-testid="button-clear-chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            {!conversationId ? (
              // Welcome Message
              <div className="max-w-4xl mx-auto">
                <div className="text-center py-8 px-4">
                  <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-primary-foreground text-3xl">🤖</span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4">
                    Welcome to AI Assistant Hub
                  </h2>
                  <p className="text-muted-foreground text-sm md:text-base">
                    Start a conversation, upload files, or choose an interaction mode to begin.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Regular Messages */}
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}

                {/* Streaming Message */}
                {isStreaming && streamingContent && (
                  <div className="max-w-4xl mx-auto">
                    <div className="flex justify-start">
                      <div className="max-w-2xl">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center animate-pulse">
                            <span className="text-primary-foreground text-xs">🤖</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {selectedModel} is thinking...
                          </span>
                        </div>
                        <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                          <p className="text-sm whitespace-pre-wrap">
                            {streamingContent}
                            <span className="animate-pulse">|</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <InputArea
        value={input}
        onChange={setInput}
        onSend={handleSendMessage}
        onKeyDown={handleKeyDown}
        disabled={!conversationId || isStreaming}
        isConnected={isConnected}
        conversationId={conversationId}
      />
    </main>
  );
}
