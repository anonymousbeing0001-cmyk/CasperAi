import fetch from 'node-fetch';
import { URL } from 'url';
import * as cheerio from 'cheerio';
import { overrideSystem } from './override';
import { memorySystem } from './memory';

// Safety configuration
const BLOCKED_DOMAINS = ['.gov', '.mil', '.gov.au', '.gov.uk', '.edu.gov'];
const MAX_DEPTH = 2;
const MAX_LINKS_PER_PAGE = 10;
const REQUEST_DELAY = 2000; // 2 seconds between requests
const TIMEOUT_MS = 15000;

const START_SEEDS = [
  'https://example.com',
  'https://opensource.org',
  'https://developer.mozilla.org',
  'https://stackoverflow.com',
  'https://github.com/topics'
];

interface ScanResult {
  url: string;
  title?: string;
  content: string;
  links: string[];
  timestamp: Date;
  depth: number;
}

class WebScanner {
  private scanQueue: string[] = [];
  private scannedUrls = new Set<string>();
  private isScanning = false;

  /**
   * Check if a URL is safe to visit
   */
  isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Block government and sensitive domains
      if (BLOCKED_DOMAINS.some(domain => parsed.hostname.endsWith(domain))) {
        return false;
      }
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      
      // Avoid suspicious patterns
      const suspicious = ['admin', 'login', 'password', 'secure', 'private'];
      if (suspicious.some(word => parsed.pathname.toLowerCase().includes(word))) {
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetch page content safely
   */
  async fetchPage(url: string): Promise<ScanResult | null> {
    if (!overrideSystem.isOverrideActive()) {
      console.log('[WebScan] Override is OFF - skipping scan');
      return null;
    }

    if (!this.isSafeUrl(url)) {
      console.log('[WebScan] Skipped unsafe URL:', url);
      return null;
    }

    if (this.scannedUrls.has(url)) {
      console.log('[WebScan] Already scanned:', url);
      return null;
    }

    try {
      console.log('[WebScan] Fetching:', url);
      
      const response = await fetch(url, {
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Casper-AI-Scanner/1.0 (Educational purposes)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        console.log('[WebScan] HTTP error:', response.status, url);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract title
      const title = $('title').text().trim();
      
      // Extract main content (remove scripts, styles, etc.)
      $('script, style, nav, header, footer, aside').remove();
      const content = $('body').text().trim().substring(0, 5000); // Limit content size
      
      // Extract links
      const links: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, url).toString();
            if (this.isSafeUrl(absoluteUrl)) {
              links.push(absoluteUrl);
            }
          } catch (e) {
            // Invalid URL, skip
          }
        }
      });

      this.scannedUrls.add(url);
      
      const result: ScanResult = {
        url,
        title,
        content,
        links: links.slice(0, MAX_LINKS_PER_PAGE),
        timestamp: new Date(),
        depth: 0
      };

      // Store in memory system
      await memorySystem.learnFromText(
        `Title: ${title}\nContent: ${content}`,
        url,
        'text'
      );

      console.log(`[WebScan] Successfully scanned: ${title || url}`);
      return result;
      
    } catch (error) {
      console.log('[WebScan] Failed to fetch', url, error.message);
      return null;
    }
  }

  /**
   * Autonomous recursive scanning
   */
  async autonomousScan(urls: string[] = START_SEEDS, depth: number = MAX_DEPTH): Promise<ScanResult[]> {
    if (!overrideSystem.isOverrideActive() || depth <= 0) {
      console.log('[WebScan] Scan stopped - override off or max depth reached');
      return [];
    }

    if (this.isScanning) {
      console.log('[WebScan] Already scanning - skipping');
      return [];
    }

    this.isScanning = true;
    const results: ScanResult[] = [];

    try {
      for (const url of urls) {
        if (!overrideSystem.isOverrideActive()) {
          console.log('[WebScan] Override turned off - stopping scan');
          break;
        }

        const result = await this.fetchPage(url);
        if (result) {
          result.depth = MAX_DEPTH - depth + 1;
          results.push(result);

          // Add discovered links to queue for next depth level
          if (depth > 1 && result.links.length > 0) {
            const newUrls = result.links.filter(link => !this.scannedUrls.has(link));
            if (newUrls.length > 0) {
              console.log(`[WebScan] Found ${newUrls.length} new URLs for depth ${depth - 1}`);
              const nextResults = await this.autonomousScan(newUrls.slice(0, 5), depth - 1);
              results.push(...nextResults);
            }
          }
        }

        // Respectful delay between requests
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    } catch (error) {
      console.error('[WebScan] Scan error:', error);
    } finally {
      this.isScanning = false;
    }

    console.log(`[WebScan] Completed scan - processed ${results.length} pages`);
    return results;
  }

  /**
   * Start autonomous scanning loop
   */
  startAutonomousScanning(intervalMinutes: number = 60): void {
    console.log(`[WebScan] Starting autonomous scanning every ${intervalMinutes} minutes`);
    
    const scanInterval = setInterval(async () => {
      if (overrideSystem.isOverrideActive() && !this.isScanning) {
        console.log('[WebScan] Starting scheduled autonomous scan...');
        try {
          await this.autonomousScan();
        } catch (error) {
          console.error('[WebScan] Autonomous scan error:', error);
        }
      }
    }, intervalMinutes * 60 * 1000);

    // Stop scanning when override is turned off
    overrideSystem.onOverrideChange(() => {
      if (!overrideSystem.isOverrideActive()) {
        console.log('[WebScan] Override turned off - autonomous scanning paused');
      }
    });

    return () => clearInterval(scanInterval);
  }

  /**
   * Get scan statistics
   */
  getStats() {
    return {
      scannedCount: this.scannedUrls.size,
      isScanning: this.isScanning,
      queueSize: this.scanQueue.length,
      overrideActive: overrideSystem.isOverrideActive()
    };
  }

  /**
   * Search scanned content
   */
  async searchContent(query: string): Promise<any[]> {
    return await memorySystem.fetchKnowledge(query, 'text');
  }

  /**
   * Reset scanner state
   */
  reset(): void {
    this.scannedUrls.clear();
    this.scanQueue = [];
    this.isScanning = false;
  }
}

export const webScanner = new WebScanner();
export { WebScanner, ScanResult };