import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import ChatArea from "@/components/chat-area";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Conversation, Message } from "@shared/schema";

export default function ChatPage() {
  const { id: conversationId } = useParams();
  const [selectedModel, setSelectedModel] = useState("gpt-5");
  const [selectedMode, setSelectedMode] = useState("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
  });

  const { data: currentConversation } = useQuery<Conversation>({
    queryKey: ['/api/conversations', conversationId],
    enabled: !!conversationId,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/conversations', conversationId, 'messages'],
    enabled: !!conversationId,
  });

  const { sendMessage, isConnected, isStreaming, streamingContent } = useWebSocket();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background text-foreground font-sans overflow-hidden">
      <Sidebar
        conversations={conversations}
        selectedModel={selectedModel}
        selectedMode={selectedMode}
        onModelChange={setSelectedModel}
        onModeChange={setSelectedMode}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        currentConversationId={conversationId}
      />
      
      <ChatArea
        conversationId={conversationId}
        messages={messages}
        selectedModel={selectedModel}
        selectedMode={selectedMode}
        isConnected={isConnected}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        onSendMessage={(message, convId, model, mode) => sendMessage(message, convId, model || selectedModel, mode || selectedMode)}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        showSidebarToggle={!isSidebarOpen}
      />
    </div>
  );
}
