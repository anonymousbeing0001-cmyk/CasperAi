import { MongoClient, Collection } from 'mongodb';

const MONGO_URI = process.env.DATABASE_URL; // Using the provided DATABASE_URL
const DATABASE_NAME = 'CasperMemoryCore';
const COLLECTION_NAME = 'knowledge';

// Memory shards for different content types
const MEMORY_SHARDS = ['default', 'text', 'images', 'audio', 'code'];

interface KnowledgeEntry {
  text: string;
  shard: string;
  timestamp: Date;
  source?: string;
  metadata?: any;
  embedding?: number[];
}

class MemorySystem {
  private client: MongoClient | null = null;
  private collection: Collection<KnowledgeEntry> | null = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    if (!MONGO_URI) {
      console.error('[Memory] MongoDB URI missing - memory system disabled');
      return;
    }

    try {
      this.client = new MongoClient(MONGO_URI);
      await this.client.connect();
      this.collection = this.client.db(DATABASE_NAME).collection<KnowledgeEntry>(COLLECTION_NAME);
      
      // Create indexes for better performance
      await this.collection.createIndex({ text: 'text' });
      await this.collection.createIndex({ shard: 1 });
      await this.collection.createIndex({ timestamp: -1 });
      
      this.isInitialized = true;
      console.log('[Memory] Connected to MemoryCore');
    } catch (error) {
      console.error('[Memory] Failed to connect:', error);
    }
  }

  async saveKnowledge(entry: Omit<KnowledgeEntry, 'timestamp'>): Promise<void> {
    if (!this.collection) await this.init();
    if (!this.collection) return;

    const fullEntry: KnowledgeEntry = {
      ...entry,
      timestamp: new Date(),
      shard: entry.shard || 'default'
    };

    try {
      await this.collection.updateOne(
        { text: entry.text, shard: entry.shard },
        { $set: fullEntry },
        { upsert: true }
      );
      console.log(`[Memory] Saved knowledge to ${entry.shard} shard`);
    } catch (error) {
      console.error('[Memory] Failed to save knowledge:', error);
    }
  }

  async fetchKnowledge(keyword: string, shard?: string): Promise<KnowledgeEntry[]> {
    if (!this.collection) await this.init();
    if (!this.collection) return [];

    try {
      const query: any = {
        $or: [
          { text: { $regex: keyword, $options: 'i' } },
          { 'metadata.keywords': { $regex: keyword, $options: 'i' } }
        ]
      };

      if (shard) {
        query.shard = shard;
      }

      const results = await this.collection.find(query)
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray();
        
      console.log(`[Memory] Found ${results.length} knowledge entries for "${keyword}"`);
      return results;
    } catch (error) {
      console.error('[Memory] Failed to fetch knowledge:', error);
      return [];
    }
  }

  async learnFromText(text: string, source?: string, shard: string = 'text'): Promise<void> {
    // Extract meaningful chunks from text
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const cleanSentence = sentence.trim();
      if (cleanSentence) {
        await this.saveKnowledge({
          text: cleanSentence,
          shard,
          source,
          metadata: {
            wordCount: cleanSentence.split(' ').length,
            keywords: this.extractKeywords(cleanSentence)
          }
        });
      }
    }
  }

  async learnFromCode(code: string, language: string, source?: string): Promise<void> {
    await this.saveKnowledge({
      text: code,
      shard: 'code',
      source,
      metadata: {
        language,
        lines: code.split('\n').length,
        keywords: this.extractCodeKeywords(code)
      }
    });
  }

  async getShardStats(): Promise<Record<string, number>> {
    if (!this.collection) await this.init();
    if (!this.collection) return {};

    const stats: Record<string, number> = {};
    
    for (const shard of MEMORY_SHARDS) {
      try {
        const count = await this.collection.countDocuments({ shard });
        stats[shard] = count;
      } catch (error) {
        stats[shard] = 0;
      }
    }
    
    return stats;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - could be enhanced with NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Remove common stop words
    const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'have']);
    return [...new Set(words.filter(word => !stopWords.has(word)))];
  }

  private extractCodeKeywords(code: string): string[] {
    // Extract function names, class names, etc.
    const keywords = [];
    const patterns = [
      /function\s+(\w+)/g,
      /class\s+(\w+)/g,
      /const\s+(\w+)/g,
      /let\s+(\w+)/g,
      /var\s+(\w+)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        keywords.push(match[1]);
      }
    }
    
    return [...new Set(keywords)];
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isInitialized = false;
    }
  }
}

export const memorySystem = new MemorySystem();
export { KnowledgeEntry, MemorySystem };