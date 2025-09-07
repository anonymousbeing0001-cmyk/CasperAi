import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { memorySystem } from './memory';
import { overrideSystem } from './override';

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ProcessingResult {
  type: 'text' | 'image' | 'audio' | 'code';
  content: string;
  analysis?: any;
  metadata?: Record<string, any>;
  timestamp: Date;
  source?: string;
}

class MultiModalProcessor {
  /**
   * Process text content with AI analysis
   */
  async processText(text: string, source?: string): Promise<ProcessingResult> {
    try {
      console.log('[MultiModal] Processing text content...');
      
      // Use Anthropic for text analysis
      // <important_do_not_delete>
      const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
      // </important_do_not_delete>
      
      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze this text and extract key insights, topics, and sentiment. Respond in JSON format with keys: "summary", "topics", "sentiment", "keyPoints":
          
${text}`
        }],
      });

      let analysis = {};
      try {
        analysis = JSON.parse(response.content[0].text);
      } catch (e) {
        analysis = { summary: response.content[0].text };
      }

      // Store in memory system
      await memorySystem.learnFromText(text, source, 'text');

      const result: ProcessingResult = {
        type: 'text',
        content: text,
        analysis,
        metadata: {
          wordCount: text.split(' ').length,
          characters: text.length
        },
        timestamp: new Date(),
        source
      };

      console.log(`[MultiModal] Text processing complete - ${text.length} characters analyzed`);
      return result;
      
    } catch (error) {
      console.error('[MultiModal] Text processing failed:', error);
      throw error;
    }
  }

  /**
   * Process image content with vision analysis
   */
  async processImage(imagePath: string, source?: string): Promise<ProcessingResult> {
    try {
      console.log('[MultiModal] Processing image content...');
      
      // Read and convert image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      // Use GPT-5 for image analysis (newer OpenAI model for vision)
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image in detail. Describe the content, objects, people, setting, mood, colors, and any text visible. Respond in JSON format with keys: 'description', 'objects', 'colors', 'mood', 'text_detected'."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }],
        max_tokens: 500,
      });

      let analysis = {};
      try {
        analysis = JSON.parse(response.choices[0].message.content || '{}');
      } catch (e) {
        analysis = { description: response.choices[0].message.content };
      }

      // Store in memory system
      await memorySystem.saveKnowledge({
        text: `Image: ${analysis.description || 'Image processed'}`,
        shard: 'images',
        source,
        metadata: {
          filename: path.basename(imagePath),
          type: 'image',
          analysis
        }
      });

      const result: ProcessingResult = {
        type: 'image',
        content: imagePath,
        analysis,
        metadata: {
          size: imageBuffer.length,
          mimeType,
          filename: path.basename(imagePath)
        },
        timestamp: new Date(),
        source
      };

      console.log('[MultiModal] Image processing complete');
      return result;
      
    } catch (error) {
      console.error('[MultiModal] Image processing failed:', error);
      throw error;
    }
  }

  /**
   * Process audio content with transcription and analysis
   */
  async processAudio(audioPath: string, source?: string): Promise<ProcessingResult> {
    try {
      console.log('[MultiModal] Processing audio content...');
      
      // Transcribe audio using Whisper
      const audioStream = fs.createReadStream(audioPath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
      });

      const transcriptText = transcription.text;
      
      // Analyze the transcript
      const textAnalysis = await this.processText(transcriptText, source);

      // Store in memory system
      await memorySystem.saveKnowledge({
        text: transcriptText,
        shard: 'audio',
        source,
        metadata: {
          filename: path.basename(audioPath),
          type: 'audio',
          transcript: transcriptText,
          duration: transcription.duration || 0
        }
      });

      const result: ProcessingResult = {
        type: 'audio',
        content: transcriptText,
        analysis: {
          transcript: transcriptText,
          textAnalysis: textAnalysis.analysis,
          duration: transcription.duration || 0
        },
        metadata: {
          filename: path.basename(audioPath),
          originalPath: audioPath
        },
        timestamp: new Date(),
        source
      };

      console.log('[MultiModal] Audio processing complete');
      return result;
      
    } catch (error) {
      console.error('[MultiModal] Audio processing failed:', error);
      throw error;
    }
  }

  /**
   * Process code content with analysis
   */
  async processCode(code: string, language: string, source?: string): Promise<ProcessingResult> {
    try {
      console.log(`[MultiModal] Processing ${language} code...`);
      
      // Use Anthropic for code analysis
      // <important_do_not_delete>
      const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
      // </important_do_not_delete>
      
      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze this ${language} code and provide insights. Respond in JSON format with keys: "purpose", "functions", "complexity", "suggestions", "technologies":

\`\`\`${language}
${code}
\`\`\``
        }],
      });

      let analysis = {};
      try {
        analysis = JSON.parse(response.content[0].text);
      } catch (e) {
        analysis = { purpose: response.content[0].text };
      }

      // Store in memory system
      await memorySystem.learnFromCode(code, language, source);

      const result: ProcessingResult = {
        type: 'code',
        content: code,
        analysis,
        metadata: {
          language,
          lines: code.split('\n').length,
          characters: code.length
        },
        timestamp: new Date(),
        source
      };

      console.log(`[MultiModal] Code processing complete - ${language} analyzed`);
      return result;
      
    } catch (error) {
      console.error('[MultiModal] Code processing failed:', error);
      throw error;
    }
  }

  /**
   * Auto-detect and process content based on file type
   */
  async processFile(filePath: string, source?: string): Promise<ProcessingResult> {
    if (!overrideSystem.isOverrideActive()) {
      throw new Error('Processing disabled - override not active');
    }

    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);
    
    console.log(`[MultiModal] Auto-processing file: ${filename}`);

    // Image files
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
      return await this.processImage(filePath, source || filename);
    }
    
    // Audio files
    if (['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.mp4'].includes(ext)) {
      return await this.processAudio(filePath, source || filename);
    }
    
    // Code files
    const codeExtensions: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml'
    };
    
    if (codeExtensions[ext]) {
      const code = fs.readFileSync(filePath, 'utf-8');
      return await this.processCode(code, codeExtensions[ext], source || filename);
    }
    
    // Text files
    if (['.txt', '.md', '.log', '.csv'].includes(ext) || ext === '') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return await this.processText(text, source || filename);
    }
    
    throw new Error(`Unsupported file type: ${ext}`);
  }

  /**
   * Generate content based on prompt and modality
   */
  async generateContent(prompt: string, type: 'text' | 'image' | 'code', options?: any): Promise<any> {
    if (!overrideSystem.isOverrideActive()) {
      throw new Error('Generation disabled - override not active');
    }

    console.log(`[MultiModal] Generating ${type} content...`);

    switch (type) {
      case 'text':
        // <important_do_not_delete>
        const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
        // </important_do_not_delete>
        
        const response = await anthropic.messages.create({
          model: DEFAULT_MODEL_STR,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        });
        
        return response.content[0].text;

      case 'image':
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
        });
        
        return imageResponse.data[0].url;

      case 'code':
        const codePrompt = `Generate ${options?.language || 'JavaScript'} code for: ${prompt}. Include comments and proper structure.`;
        
        const codeResponse = await anthropic.messages.create({
          model: DEFAULT_MODEL_STR,
          max_tokens: 2048,
          messages: [{ role: 'user', content: codePrompt }],
        });
        
        return codeResponse.content[0].text;

      default:
        throw new Error(`Unsupported generation type: ${type}`);
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Get processing statistics
   */
  async getStats() {
    const memoryStats = await memorySystem.getShardStats();
    
    return {
      memoryShards: memoryStats,
      capabilities: {
        text: true,
        images: !!process.env.OPENAI_API_KEY,
        audio: !!process.env.OPENAI_API_KEY,
        code: true,
        generation: {
          text: !!process.env.ANTHROPIC_API_KEY,
          images: !!process.env.OPENAI_API_KEY,
          code: !!process.env.ANTHROPIC_API_KEY
        }
      },
      overrideActive: overrideSystem.isOverrideActive()
    };
  }
}

export const multiModalProcessor = new MultiModalProcessor();
export { MultiModalProcessor, ProcessingResult };