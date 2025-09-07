import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Lightbulb, Wand2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  isConnected: boolean;
  conversationId?: string;
}

const MAX_CHARS = 4000;

export default function InputArea({
  value,
  onChange,
  onSend,
  onKeyDown,
  disabled,
  isConnected,
  conversationId,
}: InputAreaProps) {
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [remainingTokens] = useState(2847); // This would come from API in real app
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadFilesMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      if (conversationId) {
        formData.append('conversationId', conversationId);
      }

      const response = await apiRequest('POST', '/api/files/upload', formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      toast({
        title: "Files uploaded",
        description: "Your files have been uploaded successfully.",
      });
      setShowFileUpload(false);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFilesMutation.mutate(files);
    }
  };

  const handleAttachClick = () => {
    if (showFileUpload) {
      fileInputRef.current?.click();
    } else {
      setShowFileUpload(true);
    }
  };

  const handleTemplateClick = () => {
    toast({
      title: "Templates",
      description: "Template feature will be implemented soon.",
    });
  };

  const handleExamplesClick = () => {
    toast({
      title: "Examples",
      description: "Examples feature will be implemented soon.",
    });
  };

  const characterCount = value.length;
  const isOverLimit = characterCount > MAX_CHARS;

  return (
    <div className="border-t border-border bg-card">
      {/* File Upload Zone */}
      {showFileUpload && (
        <div className="p-4 border-b border-border">
          <div 
            className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            data-testid="file-upload-zone"
          >
            <div className="text-2xl text-muted-foreground mb-3">☁️</div>
            <p className="text-sm text-foreground mb-2">Drop files here or click to upload</p>
            <p className="text-xs text-muted-foreground">
              Supports: PDF, DOC, TXT, CSV, JSON (Max 10MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.csv,.json"
              onChange={handleFileUpload}
              data-testid="input-file-upload"
            />
          </div>
        </div>
      )}

      {/* Main Input Area */}
      <div className="p-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="flex items-end space-x-3">
              {/* Attachment Button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAttachClick}
                className="flex-shrink-0 min-w-[48px] min-h-[48px] touch-manipulation"
                data-testid="button-attach"
              >
                <Paperclip className="w-5 h-5" />
              </Button>

              {/* Text Input */}
              <div className="flex-1 relative">
                <Textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Type your message... (Shift + Enter for new line)"
                  className={`w-full bg-input border-border resize-none min-h-[48px] max-h-32 pr-16 text-base touch-manipulation ${
                    isOverLimit ? "border-destructive" : ""
                  }`}
                  disabled={disabled}
                  data-testid="textarea-message-input"
                  style={{ WebkitAppearance: 'none', fontSize: '16px' }}
                />
                
                {/* Character Count */}
                <div className={`absolute bottom-1 right-1 text-xs ${
                  isOverLimit ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {characterCount}/{MAX_CHARS}
                </div>
              </div>

              {/* Send Button */}
              <Button
                onClick={onSend}
                disabled={disabled || !value.trim() || isOverLimit}
                className="flex-shrink-0 min-w-[48px] min-h-[48px] touch-manipulation"
                data-testid="button-send-message"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTemplateClick}
                  className="text-sm h-auto px-3 py-2 min-h-[40px] touch-manipulation"
                  data-testid="button-templates"
                >
                  <Wand2 className="w-4 h-4 mr-1" />
                  Templates
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExamplesClick}
                  className="text-sm h-auto px-3 py-2 min-h-[40px] touch-manipulation"
                  data-testid="button-examples"
                >
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Examples
                </Button>
              </div>

              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span data-testid="text-connection-status">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`} />
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
                <span>•</span>
                <span data-testid="text-remaining-tokens">
                  {remainingTokens.toLocaleString()} tokens remaining
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
