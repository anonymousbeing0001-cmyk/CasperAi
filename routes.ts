import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { 
  insertConversationSchema, insertMessageSchema, insertUploadedFileSchema,
  insertKnowledgeEntrySchema, insertScanResultSchema, insertSystemOperationSchema,
  insertProcessedFileSchema, insertSystemMetricSchema, insertAutonomousLogSchema,
  type AutonomousSystemStats, type MultiModalCapabilities 
} from "@shared/schema";
import * as openaiService from "./services/openai";
import * as anthropicService from "./services/anthropic";

// Import all autonomous system services
import { memorySystem } from "./services/memory";
import { overrideSystem } from "./services/override";
import { webScanner } from "./services/webScanner";
import { multiModalProcessor } from "./services/multiModal";
import { autoProvisioningSystem } from "./services/autoProvision";
import { vaultSystem } from "./services/vault";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server on distinct path to avoid Vite HMR conflicts
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Store active WebSocket connections
  const connections = new Map<string, WebSocket>();

  wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substr(2, 9);
    connections.set(connectionId, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat') {
          const { conversationId, content, model, mode } = message;
          
          // Save user message
          const userMessage = await storage.createMessage({
            conversationId,
            role: 'user',
            content,
          });

          // Get conversation history
          const messages = await storage.getMessagesByConversation(conversationId);
          const messageHistory = messages.map(m => ({ role: m.role, content: m.content }));

          // Determine which AI service to use
          const isOpenAI = model.includes('gpt');
          const aiService = isOpenAI ? openaiService : anthropicService;

          // Generate AI response with streaming
          let aiResponse = "";
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'streaming_start' }));
          }

          const { content: fullResponse, tokenUsage } = await aiService.generateStreamingCompletion(
            messageHistory,
            model,
            (chunk) => {
              aiResponse += chunk;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: 'streaming_chunk', 
                  content: chunk 
                }));
              }
            }
          );

          // Save AI message
          await storage.createMessage({
            conversationId,
            role: 'assistant',
            content: fullResponse,
            model,
            tokenUsage,
          });

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'streaming_complete',
              content: fullResponse,
              tokenUsage
            }));
          }
        }
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: error instanceof Error ? error.message : 'Unknown error' 
          }));
        }
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });
  });

  // Conversations endpoints
  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    try {
      const data = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(data);
      res.json(conversation);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/conversations/:id', async (req, res) => {
    try {
      const deleted = await storage.deleteConversation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Messages endpoints
  app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
      const messages = await storage.getMessagesByConversation(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
      const data = insertMessageSchema.parse({
        ...req.body,
        conversationId: req.params.id
      });
      const message = await storage.createMessage(data);
      res.json(message);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // File upload endpoints
  app.post('/api/files/upload', upload.array('files'), async (req, res) => {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const { conversationId } = req.body;
      const uploadedFiles = [];

      for (const file of req.files) {
        const fileData = insertUploadedFileSchema.parse({
          name: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: file.path,
          conversationId: conversationId || null,
        });

        const savedFile = await storage.createUploadedFile(fileData);
        uploadedFiles.push(savedFile);
      }

      res.json(uploadedFiles);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/files', async (req, res) => {
    try {
      const { conversationId } = req.query;
      const files = await storage.getUploadedFiles(conversationId as string);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/files/:id', async (req, res) => {
    try {
      const file = await storage.getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Delete file from filesystem
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn('Could not delete file from filesystem:', err);
      }

      const deleted = await storage.deleteUploadedFile(req.params.id);
      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // AI completion endpoints for non-streaming requests
  app.post('/api/ai/complete', async (req, res) => {
    try {
      const { messages, model, mode } = req.body;
      
      const isOpenAI = model.includes('gpt');
      const aiService = isOpenAI ? openaiService : anthropicService;

      let result;
      switch (mode) {
        case 'completion':
          result = await aiService.generateTextCompletion(messages[0]?.content || '', model);
          break;
        case 'analysis':
        case 'generate':
        default:
          const response = await aiService.generateChatCompletion(messages, model);
          result = response.content;
          break;
      }

      res.json({ content: result });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/ai/analyze-image', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
      }

      const { model, prompt } = req.body;
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64Image = imageBuffer.toString('base64');

      const isOpenAI = model.includes('gpt');
      const aiService = isOpenAI ? openaiService : anthropicService;

      const result = await aiService.analyzeImage(base64Image, prompt);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ content: result });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ========== AUTONOMOUS SYSTEM ROUTES ==========

  // Initialize autonomous systems
  await memorySystem.init();

  // System Dashboard & Stats
  app.get('/api/autonomous/stats', async (req, res) => {
    try {
      const [memoryStats, scannerStats, operationStats, vaultStats, multiModalStats] = await Promise.all([
        memorySystem.getShardStats(),
        Promise.resolve(webScanner.getStats()),
        storage.getOperationStats(),
        Promise.resolve(vaultSystem.getStats()),
        multiModalProcessor.getStats()
      ]);

      const stats: AutonomousSystemStats = {
        memory: {
          shards: memoryStats,
          total: Object.values(memoryStats).reduce((sum, count) => sum + count, 0)
        },
        scanning: {
          scannedUrls: scannerStats.scannedCount,
          isScanning: scannerStats.isScanning,
          queueSize: scannerStats.queueSize
        },
        operations: operationStats,
        vault: {
          providers: vaultStats.totalProviders,
          healthy: vaultStats.vaultHealthy
        },
        override: {
          active: overrideSystem.isOverrideActive(),
          ...overrideSystem.getOverrideState()
        }
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Override/Kill Switch Control
  app.get('/api/autonomous/override', async (req, res) => {
    try {
      const state = {
        active: overrideSystem.isOverrideActive(),
        ...overrideSystem.getOverrideState()
      };
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/override', async (req, res) => {
    try {
      const { active, reason, user } = req.body;
      overrideSystem.setOverride(active, reason, user);
      res.json({ success: true, active });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Knowledge/Memory System
  app.get('/api/autonomous/knowledge', async (req, res) => {
    try {
      const { shard, query, limit } = req.query;
      let results;
      
      if (query) {
        results = await storage.searchKnowledgeEntries(query as string, shard as string);
      } else {
        results = await storage.getKnowledgeEntries(shard as string, parseInt(limit as string) || 50);
      }
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/knowledge', async (req, res) => {
    try {
      const data = insertKnowledgeEntrySchema.parse(req.body);
      const entry = await storage.createKnowledgeEntry(data);
      res.json(entry);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/autonomous/knowledge/stats', async (req, res) => {
    try {
      const stats = await storage.getKnowledgeStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Web Scanning
  app.get('/api/autonomous/scan/results', async (req, res) => {
    try {
      const { limit } = req.query;
      const results = await storage.getScanResults(parseInt(limit as string) || 50);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/scan/start', async (req, res) => {
    try {
      const { urls, depth } = req.body;
      
      if (!overrideSystem.isOverrideActive()) {
        return res.status(403).json({ message: 'Autonomous operations disabled' });
      }

      // Create system operation
      const operation = await storage.createSystemOperation({
        type: 'scan',
        status: 'running',
        input: { urls, depth }
      });

      // Start scanning in background
      webScanner.autonomousScan(urls, depth).then(async (results) => {
        for (const result of results) {
          await storage.createScanResult(result);
        }
        await storage.updateSystemOperation(operation.id, {
          status: 'completed',
          output: { scannedCount: results.length }
        });
      }).catch(async (error) => {
        await storage.updateSystemOperation(operation.id, {
          status: 'failed',
          error: error.message
        });
      });

      res.json({ operationId: operation.id, status: 'started' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/autonomous/scan/search', async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ message: 'Query parameter required' });
      }
      
      const results = await webScanner.searchContent(query as string);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Multi-Modal Processing
  app.get('/api/autonomous/multimodal/capabilities', async (req, res) => {
    try {
      const capabilities = await multiModalProcessor.getStats();
      res.json(capabilities);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/multimodal/process-text', async (req, res) => {
    try {
      const { text, source } = req.body;
      
      if (!overrideSystem.isOverrideActive()) {
        return res.status(403).json({ message: 'Processing disabled' });
      }

      const result = await multiModalProcessor.processText(text, source);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/multimodal/process-file', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      if (!overrideSystem.isOverrideActive()) {
        return res.status(403).json({ message: 'Processing disabled' });
      }

      const result = await multiModalProcessor.processFile(req.file.path, req.file.originalname);
      
      // Store processed file record
      await storage.createProcessedFile({
        filename: req.file.originalname,
        originalPath: req.file.path,
        type: result.type,
        content: result.content,
        analysis: result.analysis,
        metadata: result.metadata
      });

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json(result);
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/multimodal/generate', async (req, res) => {
    try {
      const { prompt, type, options } = req.body;
      
      if (!overrideSystem.isOverrideActive()) {
        return res.status(403).json({ message: 'Generation disabled' });
      }

      const result = await multiModalProcessor.generateContent(prompt, type, options);
      res.json({ content: result });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Auto-Provisioning
  app.post('/api/autonomous/provision/test-email', async (req, res) => {
    try {
      const result = await autoProvisioningSystem.testEmailSetup();
      res.json({ success: result });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/provision/start', async (req, res) => {
    try {
      const { providers } = req.body; // ['mongodb', 'supabase'] or 'all'
      
      if (!overrideSystem.isOverrideActive()) {
        return res.status(403).json({ message: 'Provisioning disabled' });
      }

      // Create system operation
      const operation = await storage.createSystemOperation({
        type: 'provision',
        status: 'running',
        input: { providers }
      });

      // Start provisioning in background
      if (providers === 'all') {
        autoProvisioningSystem.provisionAll().then(async (results) => {
          await storage.updateSystemOperation(operation.id, {
            status: 'completed',
            output: { results }
          });
        }).catch(async (error) => {
          await storage.updateSystemOperation(operation.id, {
            status: 'failed',
            error: error.message
          });
        });
      } else {
        // Individual provider provisioning would go here
        res.status(400).json({ message: 'Individual provider provisioning not yet implemented' });
        return;
      }

      res.json({ operationId: operation.id, status: 'started' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Vault Management
  app.get('/api/autonomous/vault/providers', async (req, res) => {
    try {
      const providers = vaultSystem.getProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/autonomous/vault/stats', async (req, res) => {
    try {
      const stats = vaultSystem.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/vault/store', async (req, res) => {
    try {
      const { providerName, credentials } = req.body;
      await vaultSystem.storeCredentials(providerName, credentials);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/autonomous/vault/:provider', async (req, res) => {
    try {
      const success = vaultSystem.removeCredentials(req.params.provider);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // System Operations
  app.get('/api/autonomous/operations', async (req, res) => {
    try {
      const { type, status, limit } = req.query;
      const operations = await storage.getSystemOperations(
        type as string, 
        status as string, 
        parseInt(limit as string) || 50
      );
      res.json(operations);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/autonomous/operations/:id', async (req, res) => {
    try {
      const operation = await storage.getSystemOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ message: 'Operation not found' });
      }
      res.json(operation);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Logs & Metrics
  app.get('/api/autonomous/logs', async (req, res) => {
    try {
      const { category, level, limit } = req.query;
      const logs = await storage.getAutonomousLogs(
        category as string,
        level as string,
        parseInt(limit as string) || 100
      );
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/autonomous/logs', async (req, res) => {
    try {
      const data = insertAutonomousLogSchema.parse(req.body);
      const log = await storage.createAutonomousLog(data);
      res.json(log);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/autonomous/metrics', async (req, res) => {
    try {
      const { category, limit } = req.query;
      const metrics = await storage.getSystemMetrics(
        category as string,
        parseInt(limit as string) || 100
      );
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Processed Files
  app.get('/api/autonomous/processed-files', async (req, res) => {
    try {
      const { type, limit } = req.query;
      const files = await storage.getProcessedFiles(
        type as string,
        parseInt(limit as string) || 50
      );
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Start autonomous web scanning (optional - can be controlled via dashboard)
  if (overrideSystem.isOverrideActive()) {
    console.log('[Autonomous] Starting autonomous web scanning...');
    webScanner.startAutonomousScanning(60); // Every 60 minutes
  }

  return httpServer;
}
