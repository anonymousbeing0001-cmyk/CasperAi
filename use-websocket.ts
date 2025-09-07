import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface WebSocketMessage {
  type: 'streaming_start' | 'streaming_chunk' | 'streaming_complete' | 'error';
  content?: string;
  tokenUsage?: number;
  message?: string;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WebSocket] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          
          switch (data.type) {
            case 'streaming_start':
              setIsStreaming(true);
              setStreamingContent("");
              break;
              
            case 'streaming_chunk':
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
              }
              break;
              
            case 'streaming_complete':
              setIsStreaming(false);
              setStreamingContent("");
              // Invalidate both conversations and messages queries to refetch
              queryClient.invalidateQueries({ 
                queryKey: ['/api/conversations'],
              });
              // Also invalidate messages for all conversations to ensure UI updates
              queryClient.invalidateQueries({ 
                queryKey: ['/api/conversations', undefined, 'messages'],
                exact: false
              });
              break;
              
            case 'error':
              setIsStreaming(false);
              setStreamingContent("");
              toast({
                title: "AI Error",
                description: data.message || "An error occurred while processing your request.",
                variant: "destructive",
              });
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsStreaming(false);
        setStreamingContent("");
        console.log('[WebSocket] Disconnected');
        
        // Attempt to reconnect after a delay
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setIsConnected(false);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient, toast]);

  const sendMessage = useCallback((content: string, conversationId: string, model?: string, mode?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isStreaming) {
      const message = {
        type: 'chat',
        conversationId,
        content,
        model: model || 'gpt-5',
        mode: mode || 'chat',
      };
      
      wsRef.current.send(JSON.stringify(message));
    } else {
      toast({
        title: "Connection Error",
        description: "Unable to send message. Please check your connection.",
        variant: "destructive",
      });
    }
  }, [isStreaming, toast]);

  return {
    isConnected,
    isStreaming,
    streamingContent,
    sendMessage,
  };
}
