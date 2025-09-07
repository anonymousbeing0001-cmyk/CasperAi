import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  model: text("model").notNull(),
  mode: text("mode").notNull(), // chat, completion, analysis, generate
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  model: text("model"),
  tokenUsage: integer("token_usage"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  title: true,
  model: true,
  mode: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  model: true,
  tokenUsage: true,
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).pick({
  name: true,
  originalName: true,
  mimeType: true,
  size: true,
  path: true,
  conversationId: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

export type User = {
  id: string;
  username: string;
  password: string;
};

export type InsertUser = {
  username: string;
  password: string;
};

// ===================== AUTONOMOUS SYSTEM TABLES =====================

export const knowledgeEntries = pgTable("knowledge_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  shard: text("shard").notNull().default('default'), // default, text, images, audio, code
  source: text("source"), // URL, filename, or other source identifier
  metadata: jsonb("metadata"), // Keywords, analysis results, etc.
  embedding: text("embedding"), // For future vector search
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scanResults = pgTable("scan_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  links: jsonb("links"), // Array of discovered links
  depth: integer("depth").notNull().default(0),
  status: text("status").notNull().default('completed'), // pending, completed, failed
  metadata: jsonb("metadata"), // Additional scan information
  scannedAt: timestamp("scanned_at").defaultNow(),
});

export const systemOperations = pgTable("system_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // scan, provision, process, generate
  status: text("status").notNull().default('pending'), // pending, running, completed, failed
  progress: integer("progress").default(0), // 0-100 percentage
  input: jsonb("input"), // Operation parameters
  output: jsonb("output"), // Operation results
  error: text("error"), // Error message if failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const processedFiles = pgTable("processed_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalPath: text("original_path").notNull(),
  type: text("type").notNull(), // text, image, audio, code
  content: text("content"), // Extracted/processed content
  analysis: jsonb("analysis"), // AI analysis results
  metadata: jsonb("metadata"), // File size, duration, etc.
  operationId: varchar("operation_id").references(() => systemOperations.id),
  processedAt: timestamp("processed_at").defaultNow(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: text("metric_name").notNull(),
  value: text("value").notNull(), // JSON string for complex values
  category: text("category").notNull(), // memory, scanning, operations, vault
  timestamp: timestamp("timestamp").defaultNow(),
});

export const autonomousLogs = pgTable("autonomous_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").notNull(), // info, warn, error, debug
  message: text("message").notNull(),
  category: text("category").notNull(), // memory, scanner, vault, provision, override
  data: jsonb("data"), // Additional structured data
  timestamp: timestamp("timestamp").defaultNow(),
});

// ===================== INSERT SCHEMAS =====================

export const insertKnowledgeEntrySchema = createInsertSchema(knowledgeEntries).pick({
  text: true,
  shard: true,
  source: true,
  metadata: true,
  embedding: true,
});

export const insertScanResultSchema = createInsertSchema(scanResults).pick({
  url: true,
  title: true,
  content: true,
  links: true,
  depth: true,
  status: true,
  metadata: true,
});

export const insertSystemOperationSchema = createInsertSchema(systemOperations).pick({
  type: true,
  status: true,
  progress: true,
  input: true,
  output: true,
  error: true,
});

export const insertProcessedFileSchema = createInsertSchema(processedFiles).pick({
  filename: true,
  originalPath: true,
  type: true,
  content: true,
  analysis: true,
  metadata: true,
  operationId: true,
});

export const insertSystemMetricSchema = createInsertSchema(systemMetrics).pick({
  metricName: true,
  value: true,
  category: true,
});

export const insertAutonomousLogSchema = createInsertSchema(autonomousLogs).pick({
  level: true,
  message: true,
  category: true,
  data: true,
});

// ===================== INFER TYPES =====================

export type InsertKnowledgeEntry = z.infer<typeof insertKnowledgeEntrySchema>;
export type KnowledgeEntry = typeof knowledgeEntries.$inferSelect;

export type InsertScanResult = z.infer<typeof insertScanResultSchema>;
export type ScanResult = typeof scanResults.$inferSelect;

export type InsertSystemOperation = z.infer<typeof insertSystemOperationSchema>;
export type SystemOperation = typeof systemOperations.$inferSelect;

export type InsertProcessedFile = z.infer<typeof insertProcessedFileSchema>;
export type ProcessedFile = typeof processedFiles.$inferSelect;

export type InsertSystemMetric = z.infer<typeof insertSystemMetricSchema>;
export type SystemMetric = typeof systemMetrics.$inferSelect;

export type InsertAutonomousLog = z.infer<typeof insertAutonomousLogSchema>;
export type AutonomousLog = typeof autonomousLogs.$inferSelect;

// ===================== API RESPONSE TYPES =====================

export type AutonomousSystemStats = {
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
};

export type MultiModalCapabilities = {
  text: boolean;
  images: boolean;
  audio: boolean;
  code: boolean;
  generation: {
    text: boolean;
    images: boolean;
    code: boolean;
  };
};
