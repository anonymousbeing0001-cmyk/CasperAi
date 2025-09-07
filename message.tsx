import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Message as MessageType } from "@shared/schema";

interface MessageProps {
  message: MessageType;
}

export default function Message({ message }: MessageProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({
        title: "Copied to clipboard",
        description: "Message content has been copied.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = () => {
    toast({
      title: "Regenerate response",
      description: "This feature will be implemented soon.",
    });
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    if (isDisliked) setIsDisliked(false);
  };

  const handleDislike = () => {
    setIsDisliked(!isDisliked);
    if (isLiked) setIsLiked(false);
  };

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isUser = message.role === 'user';

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-2xl">
          {!isUser && (
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground text-xs">🤖</span>
              </div>
              {message.model && (
                <span className="text-xs text-muted-foreground">
                  {message.model}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.createdAt!)}
              </span>
            </div>
          )}

          <div
            className={`px-4 py-3 ${
              isUser
                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                : "bg-card border border-border rounded-2xl rounded-bl-md"
            }`}
            data-testid={`message-${message.id}`}
          >
            <div className="prose prose-sm prose-invert max-w-none">
              <p className="text-sm whitespace-pre-wrap m-0">{message.content}</p>
            </div>

            {!isUser && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                <div className="flex items-center space-x-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="min-h-[40px] min-w-[40px] p-2 text-muted-foreground hover:text-foreground touch-manipulation"
                    data-testid={`button-copy-message-${message.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerate}
                    className="min-h-[40px] min-w-[40px] p-2 text-muted-foreground hover:text-foreground touch-manipulation"
                    data-testid={`button-regenerate-${message.id}`}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLike}
                    className={`min-h-[40px] min-w-[40px] p-2 transition-colors touch-manipulation ${
                      isLiked 
                        ? "text-green-500 hover:text-green-600" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`button-like-${message.id}`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDislike}
                    className={`min-h-[40px] min-w-[40px] p-2 transition-colors touch-manipulation ${
                      isDisliked 
                        ? "text-red-500 hover:text-red-600" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`button-dislike-${message.id}`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </Button>
                </div>
                
                {message.tokenUsage && (
                  <span className="text-xs text-muted-foreground">
                    Token usage: {message.tokenUsage}
                  </span>
                )}
              </div>
            )}
          </div>

          {isUser && (
            <div className="flex items-center justify-end mt-2 space-x-2">
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.createdAt!)}
              </span>
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-white">U</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
