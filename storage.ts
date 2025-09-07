import { 
  type Conversation, type InsertConversation, 
  type Message, type InsertMessage, 
  type UploadedFile, type InsertUploadedFile,
  type KnowledgeEntry, type InsertKnowledgeEntry,
  type ScanResult, type InsertScanResult,
  type SystemOperation, type InsertSystemOperation,
  type ProcessedFile, type InsertProcessedFile,
  type SystemMetric, type InsertSystemMetric,
  type AutonomousLog, type InsertAutonomousLog
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Conversations
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversations(): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;

  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessage(id: string): Promise<boolean>;

  // Files
  getUploadedFile(id: string): Promise<UploadedFile | undefined>;
  getUploadedFiles(conversationId?: string): Promise<UploadedFile[]>;
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  deleteUploadedFile(id: string): Promise<boolean>;

  // ========== AUTONOMOUS SYSTEM OPERATIONS ==========

  // Knowledge Entries
  getKnowledgeEntry(id: string): Promise<KnowledgeEntry | undefined>;
  getKnowledgeEntries(shard?: string, limit?: number): Promise<KnowledgeEntry[]>;
  searchKnowledgeEntries(query: string, shard?: string): Promise<KnowledgeEntry[]>;
  createKnowledgeEntry(entry: InsertKnowledgeEntry): Promise<KnowledgeEntry>;
  updateKnowledgeEntry(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | undefined>;
  deleteKnowledgeEntry(id: string): Promise<boolean>;
  getKnowledgeStats(): Promise<Record<string, number>>;

  // Scan Results
  getScanResult(id: string): Promise<ScanResult | undefined>;
  getScanResults(limit?: number): Promise<ScanResult[]>;
  getScanResultByUrl(url: string): Promise<ScanResult | undefined>;
  createScanResult(result: InsertScanResult): Promise<ScanResult>;
  updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined>;
  deleteScanResult(id: string): Promise<boolean>;

  // System Operations
  getSystemOperation(id: string): Promise<SystemOperation | undefined>;
  getSystemOperations(type?: string, status?: string, limit?: number): Promise<SystemOperation[]>;
  createSystemOperation(operation: InsertSystemOperation): Promise<SystemOperation>;
  updateSystemOperation(id: string, updates: Partial<SystemOperation>): Promise<SystemOperation | undefined>;
  deleteSystemOperation(id: string): Promise<boolean>;
  getOperationStats(): Promise<Record<string, number>>;

  // Processed Files
  getProcessedFile(id: string): Promise<ProcessedFile | undefined>;
  getProcessedFiles(type?: string, limit?: number): Promise<ProcessedFile[]>;
  getProcessedFilesByOperation(operationId: string): Promise<ProcessedFile[]>;
  createProcessedFile(file: InsertProcessedFile): Promise<ProcessedFile>;
  updateProcessedFile(id: string, updates: Partial<ProcessedFile>): Promise<ProcessedFile | undefined>;
  deleteProcessedFile(id: string): Promise<boolean>;

  // System Metrics
  getSystemMetric(id: string): Promise<SystemMetric | undefined>;
  getSystemMetrics(category?: string, limit?: number): Promise<SystemMetric[]>;
  createSystemMetric(metric: InsertSystemMetric): Promise<SystemMetric>;
  deleteSystemMetric(id: string): Promise<boolean>;
  cleanupOldMetrics(days?: number): Promise<number>;

  // Autonomous Logs
  getAutonomousLog(id: string): Promise<AutonomousLog | undefined>;
  getAutonomousLogs(category?: string, level?: string, limit?: number): Promise<AutonomousLog[]>;
  createAutonomousLog(log: InsertAutonomousLog): Promise<AutonomousLog>;
  deleteAutonomousLog(id: string): Promise<boolean>;
  cleanupOldLogs(days?: number): Promise<number>;
}

export class MemStorage implements IStorage {
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message>;
  private uploadedFiles: Map<string, UploadedFile>;
  
  // Autonomous system storage
  private knowledgeEntries: Map<string, KnowledgeEntry>;
  private scanResults: Map<string, ScanResult>;
  private systemOperations: Map<string, SystemOperation>;
  private processedFiles: Map<string, ProcessedFile>;
  private systemMetrics: Map<string, SystemMetric>;
  private autonomousLogs: Map<string, AutonomousLog>;

  constructor() {
    this.conversations = new Map();
    this.messages = new Map();
    this.uploadedFiles = new Map();
    
    // Initialize autonomous system storage
    this.knowledgeEntries = new Map();
    this.scanResults = new Map();
    this.systemOperations = new Map();
    this.processedFiles = new Map();
    this.systemMetrics = new Map();
    this.autonomousLogs = new Map();
  }

  // Conversations
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort((a, b) => 
      new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime()
    );
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = { 
      ...insertConversation, 
      id, 
      createdAt: now,
      updatedAt: now
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated = { ...conversation, ...updates, updatedAt: new Date() };
    this.conversations.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<boolean> {
    // Delete associated messages and files
    const messages = await this.getMessagesByConversation(id);
    for (const message of messages) {
      this.messages.delete(message.id);
    }
    
    const files = await this.getUploadedFiles(id);
    for (const file of files) {
      this.uploadedFiles.delete(file.id);
    }
    
    return this.conversations.delete(id);
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = { 
      ...insertMessage,
      model: insertMessage.model || null,
      tokenUsage: insertMessage.tokenUsage || null,
      id, 
      createdAt: new Date()
    };
    this.messages.set(id, message);
    
    // Update conversation updatedAt
    await this.updateConversation(insertMessage.conversationId, {});
    
    return message;
  }

  async deleteMessage(id: string): Promise<boolean> {
    return this.messages.delete(id);
  }

  // Files
  async getUploadedFile(id: string): Promise<UploadedFile | undefined> {
    return this.uploadedFiles.get(id);
  }

  async getUploadedFiles(conversationId?: string): Promise<UploadedFile[]> {
    const files = Array.from(this.uploadedFiles.values());
    if (conversationId) {
      return files.filter(file => file.conversationId === conversationId);
    }
    return files.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const id = randomUUID();
    const file: UploadedFile = { 
      ...insertFile,
      conversationId: insertFile.conversationId || null,
      id, 
      createdAt: new Date()
    };
    this.uploadedFiles.set(id, file);
    return file;
  }

  async deleteUploadedFile(id: string): Promise<boolean> {
    return this.uploadedFiles.delete(id);
  }

  // ========== AUTONOMOUS SYSTEM IMPLEMENTATIONS ==========

  // Knowledge Entries
  async getKnowledgeEntry(id: string): Promise<KnowledgeEntry | undefined> {
    return this.knowledgeEntries.get(id);
  }

  async getKnowledgeEntries(shard?: string, limit = 100): Promise<KnowledgeEntry[]> {
    let entries = Array.from(this.knowledgeEntries.values());
    if (shard) {
      entries = entries.filter(entry => entry.shard === shard);
    }
    return entries
      .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
      .slice(0, limit);
  }

  async searchKnowledgeEntries(query: string, shard?: string): Promise<KnowledgeEntry[]> {
    let entries = Array.from(this.knowledgeEntries.values());
    if (shard) {
      entries = entries.filter(entry => entry.shard === shard);
    }
    return entries.filter(entry => 
      entry.text.toLowerCase().includes(query.toLowerCase()) ||
      (entry.source && entry.source.toLowerCase().includes(query.toLowerCase()))
    );
  }

  async createKnowledgeEntry(insertEntry: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const id = randomUUID();
    const now = new Date();
    const entry: KnowledgeEntry = {
      ...insertEntry,
      shard: insertEntry.shard || 'default',
      metadata: insertEntry.metadata || null,
      embedding: insertEntry.embedding || null,
      source: insertEntry.source || null,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.knowledgeEntries.set(id, entry);
    return entry;
  }

  async updateKnowledgeEntry(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | undefined> {
    const entry = this.knowledgeEntries.get(id);
    if (!entry) return undefined;
    
    const updated = { ...entry, ...updates, updatedAt: new Date() };
    this.knowledgeEntries.set(id, updated);
    return updated;
  }

  async deleteKnowledgeEntry(id: string): Promise<boolean> {
    return this.knowledgeEntries.delete(id);
  }

  async getKnowledgeStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    for (const entry of this.knowledgeEntries.values()) {
      stats[entry.shard] = (stats[entry.shard] || 0) + 1;
    }
    return stats;
  }

  // Scan Results
  async getScanResult(id: string): Promise<ScanResult | undefined> {
    return this.scanResults.get(id);
  }

  async getScanResults(limit = 50): Promise<ScanResult[]> {
    return Array.from(this.scanResults.values())
      .sort((a, b) => new Date(b.scannedAt!).getTime() - new Date(a.scannedAt!).getTime())
      .slice(0, limit);
  }

  async getScanResultByUrl(url: string): Promise<ScanResult | undefined> {
    return Array.from(this.scanResults.values()).find(result => result.url === url);
  }

  async createScanResult(insertResult: InsertScanResult): Promise<ScanResult> {
    const id = randomUUID();
    const result: ScanResult = {
      ...insertResult,
      title: insertResult.title || null,
      links: insertResult.links || null,
      status: insertResult.status || 'completed',
      metadata: insertResult.metadata || null,
      id,
      scannedAt: new Date()
    };
    this.scanResults.set(id, result);
    return result;
  }

  async updateScanResult(id: string, updates: Partial<ScanResult>): Promise<ScanResult | undefined> {
    const result = this.scanResults.get(id);
    if (!result) return undefined;
    
    const updated = { ...result, ...updates };
    this.scanResults.set(id, updated);
    return updated;
  }

  async deleteScanResult(id: string): Promise<boolean> {
    return this.scanResults.delete(id);
  }

  // System Operations
  async getSystemOperation(id: string): Promise<SystemOperation | undefined> {
    return this.systemOperations.get(id);
  }

  async getSystemOperations(type?: string, status?: string, limit = 50): Promise<SystemOperation[]> {
    let operations = Array.from(this.systemOperations.values());
    if (type) {
      operations = operations.filter(op => op.type === type);
    }
    if (status) {
      operations = operations.filter(op => op.status === status);
    }
    return operations
      .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime())
      .slice(0, limit);
  }

  async createSystemOperation(insertOperation: InsertSystemOperation): Promise<SystemOperation> {
    const id = randomUUID();
    const operation: SystemOperation = {
      ...insertOperation,
      status: insertOperation.status || 'pending',
      progress: insertOperation.progress || 0,
      input: insertOperation.input || null,
      output: insertOperation.output || null,
      error: insertOperation.error || null,
      id,
      startedAt: new Date(),
      completedAt: null
    };
    this.systemOperations.set(id, operation);
    return operation;
  }

  async updateSystemOperation(id: string, updates: Partial<SystemOperation>): Promise<SystemOperation | undefined> {
    const operation = this.systemOperations.get(id);
    if (!operation) return undefined;
    
    const updated = { ...operation, ...updates };
    if (updates.status === 'completed' || updates.status === 'failed') {
      updated.completedAt = new Date();
    }
    this.systemOperations.set(id, updated);
    return updated;
  }

  async deleteSystemOperation(id: string): Promise<boolean> {
    return this.systemOperations.delete(id);
  }

  async getOperationStats(): Promise<Record<string, number>> {
    const stats = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const operation of this.systemOperations.values()) {
      stats[operation.status as keyof typeof stats] = (stats[operation.status as keyof typeof stats] || 0) + 1;
    }
    return stats;
  }

  // Processed Files
  async getProcessedFile(id: string): Promise<ProcessedFile | undefined> {
    return this.processedFiles.get(id);
  }

  async getProcessedFiles(type?: string, limit = 50): Promise<ProcessedFile[]> {
    let files = Array.from(this.processedFiles.values());
    if (type) {
      files = files.filter(file => file.type === type);
    }
    return files
      .sort((a, b) => new Date(b.processedAt!).getTime() - new Date(a.processedAt!).getTime())
      .slice(0, limit);
  }

  async getProcessedFilesByOperation(operationId: string): Promise<ProcessedFile[]> {
    return Array.from(this.processedFiles.values())
      .filter(file => file.operationId === operationId);
  }

  async createProcessedFile(insertFile: InsertProcessedFile): Promise<ProcessedFile> {
    const id = randomUUID();
    const file: ProcessedFile = {
      ...insertFile,
      content: insertFile.content || null,
      analysis: insertFile.analysis || null,
      metadata: insertFile.metadata || null,
      operationId: insertFile.operationId || null,
      id,
      processedAt: new Date()
    };
    this.processedFiles.set(id, file);
    return file;
  }

  async updateProcessedFile(id: string, updates: Partial<ProcessedFile>): Promise<ProcessedFile | undefined> {
    const file = this.processedFiles.get(id);
    if (!file) return undefined;
    
    const updated = { ...file, ...updates };
    this.processedFiles.set(id, updated);
    return updated;
  }

  async deleteProcessedFile(id: string): Promise<boolean> {
    return this.processedFiles.delete(id);
  }

  // System Metrics
  async getSystemMetric(id: string): Promise<SystemMetric | undefined> {
    return this.systemMetrics.get(id);
  }

  async getSystemMetrics(category?: string, limit = 100): Promise<SystemMetric[]> {
    let metrics = Array.from(this.systemMetrics.values());
    if (category) {
      metrics = metrics.filter(metric => metric.category === category);
    }
    return metrics
      .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
      .slice(0, limit);
  }

  async createSystemMetric(insertMetric: InsertSystemMetric): Promise<SystemMetric> {
    const id = randomUUID();
    const metric: SystemMetric = {
      ...insertMetric,
      id,
      timestamp: new Date()
    };
    this.systemMetrics.set(id, metric);
    return metric;
  }

  async deleteSystemMetric(id: string): Promise<boolean> {
    return this.systemMetrics.delete(id);
  }

  async cleanupOldMetrics(days = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    
    for (const [id, metric] of this.systemMetrics.entries()) {
      if (new Date(metric.timestamp!) < cutoffDate) {
        this.systemMetrics.delete(id);
        deleted++;
      }
    }
    
    return deleted;
  }

  // Autonomous Logs
  async getAutonomousLog(id: string): Promise<AutonomousLog | undefined> {
    return this.autonomousLogs.get(id);
  }

  async getAutonomousLogs(category?: string, level?: string, limit = 100): Promise<AutonomousLog[]> {
    let logs = Array.from(this.autonomousLogs.values());
    if (category) {
      logs = logs.filter(log => log.category === category);
    }
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    return logs
      .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
      .slice(0, limit);
  }

  async createAutonomousLog(insertLog: InsertAutonomousLog): Promise<AutonomousLog> {
    const id = randomUUID();
    const log: AutonomousLog = {
      ...insertLog,
      data: insertLog.data || null,
      id,
      timestamp: new Date()
    };
    this.autonomousLogs.set(id, log);
    return log;
  }

  async deleteAutonomousLog(id: string): Promise<boolean> {
    return this.autonomousLogs.delete(id);
  }

  async cleanupOldLogs(days = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    
    for (const [id, log] of this.autonomousLogs.entries()) {
      if (new Date(log.timestamp!) < cutoffDate) {
        this.autonomousLogs.delete(id);
        deleted++;
      }
    }
    
    return deleted;
  }
}

export const storage = new MemStorage();
