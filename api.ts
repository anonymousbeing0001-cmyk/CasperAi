import { apiRequest } from "./queryClient";
import type { Conversation, Message, UploadedFile } from "@shared/schema";

export const api = {
  // Conversations
  conversations: {
    list: (): Promise<Conversation[]> =>
      apiRequest('GET', '/api/conversations').then(r => r.json()),
    
    get: (id: string): Promise<Conversation> =>
      apiRequest('GET', `/api/conversations/${id}`).then(r => r.json()),
    
    create: (data: { title: string; model: string; mode: string }): Promise<Conversation> =>
      apiRequest('POST', '/api/conversations', data).then(r => r.json()),
    
    delete: (id: string): Promise<void> =>
      apiRequest('DELETE', `/api/conversations/${id}`).then(() => {}),
  },

  // Messages
  messages: {
    list: (conversationId: string): Promise<Message[]> =>
      apiRequest('GET', `/api/conversations/${conversationId}/messages`).then(r => r.json()),
    
    create: (conversationId: string, data: { role: string; content: string; model?: string }): Promise<Message> =>
      apiRequest('POST', `/api/conversations/${conversationId}/messages`, data).then(r => r.json()),
  },

  // Files
  files: {
    list: (conversationId?: string): Promise<UploadedFile[]> => {
      const params = conversationId ? `?conversationId=${conversationId}` : '';
      return apiRequest('GET', `/api/files${params}`).then(r => r.json());
    },
    
    upload: (files: FileList, conversationId?: string): Promise<UploadedFile[]> => {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));
      if (conversationId) formData.append('conversationId', conversationId);
      
      return apiRequest('POST', '/api/files/upload', formData).then(r => r.json());
    },
    
    delete: (id: string): Promise<void> =>
      apiRequest('DELETE', `/api/files/${id}`).then(() => {}),
  },

  // AI
  ai: {
    complete: (messages: Array<{role: string; content: string}>, model: string, mode: string): Promise<{content: string}> =>
      apiRequest('POST', '/api/ai/complete', { messages, model, mode }).then(r => r.json()),
    
    analyzeImage: (file: File, model: string, prompt: string): Promise<{content: string}> => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('model', model);
      formData.append('prompt', prompt);
      
      return apiRequest('POST', '/api/ai/analyze-image', formData).then(r => r.json());
    },
  },
};
