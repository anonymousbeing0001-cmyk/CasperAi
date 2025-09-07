import puppeteer, { Browser, Page } from 'puppeteer';
import { ImapFlow } from 'imapflow';
import crypto from 'crypto';
import { vaultSystem } from './vault';
import { overrideSystem } from './override';

// Email configuration from environment
const EMAIL_ADDRESS = process.env.EMAIL_ADDRESS || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_SECURE = process.env.IMAP_SECURE !== 'false';
const CASPER_FULLNAME = process.env.CASPER_FULLNAME || 'Casper AI';
const HEADLESS = process.env.HEADLESS !== 'false';

interface ProvisionResult {
  success: boolean;
  provider: string;
  credentials?: any;
  error?: string;
}

class AutoProvisioningSystem {
  private browser: Browser | null = null;

  /**
   * Initialize browser for automation
   */
  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Generate secure password
   */
  private generatePassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const symbols = '!@#$%^&*';
    
    let password = '';
    // At least 12 characters with mix of types
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));
    password += '1A'; // Ensure number and uppercase
    
    return password;
  }

  /**
   * Wait for verification email
   */
  private async waitForVerificationEmail(options: {
    fromIncludes?: string;
    subjectIncludes?: string;
    timeoutMs?: number;
  }): Promise<string | null> {
    const { fromIncludes = '', subjectIncludes = '', timeoutMs = 120000 } = options;
    
    if (!EMAIL_ADDRESS || !EMAIL_PASSWORD) {
      console.error('[AutoProvision] Email credentials not configured');
      return null;
    }

    try {
      const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: IMAP_SECURE,
        auth: {
          user: EMAIL_ADDRESS,
          pass: EMAIL_PASSWORD
        }
      });

      await client.connect();
      await client.mailboxOpen('INBOX');

      const startTime = Date.now();
      
      while (Date.now() - startTime < timeoutMs) {
        if (!overrideSystem.isOverrideActive()) {
          console.log('[AutoProvision] Override turned off - stopping email check');
          break;
        }

        const lock = await client.getMailboxLock('INBOX');
        
        try {
          // Get recent unread messages
          const messages = await client.search({ seen: false });
          
          for (const seq of messages.slice(-10)) { // Check last 10 unread messages
            const msg = await client.fetchOne(seq, { envelope: true, source: true });
            const envelope = msg.envelope || {};
            
            const fromStr = (envelope.from || []).map(f => f.address).join(' ').toLowerCase();
            const subject = (envelope.subject || '').toLowerCase();
            
            const matchesFrom = !fromIncludes || fromStr.includes(fromIncludes.toLowerCase());
            const matchesSubject = !subjectIncludes || subject.includes(subjectIncludes.toLowerCase());
            
            if (matchesFrom || matchesSubject) {
              const rawContent = msg.source?.toString() || '';
              
              // Extract verification links
              const linkMatches = rawContent.match(/https?:\/\/[^\s)>\]]+/gi) || [];
              const verifyLink = linkMatches.find(link => 
                /verify|confirm|activate|signup|email|magic/i.test(link)
              );
              
              if (verifyLink) {
                console.log(`[AutoProvision] Found verification email from: ${fromStr}`);
                await client.logout();
                return verifyLink;
              }
            }
          }
        } finally {
          lock.release();
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      await client.logout();
      return null;
      
    } catch (error) {
      console.error('[AutoProvision] Email check failed:', error);
      return null;
    }
  }

  /**
   * Navigate to verification link
   */
  private async handleVerificationLink(browser: Browser, link: string): Promise<boolean> {
    try {
      const page = await browser.newPage();
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Look for common verification success indicators
      const success = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('verified') || 
               text.includes('confirmed') || 
               text.includes('activated') ||
               text.includes('success');
      });
      
      await page.close();
      return success;
    } catch (error) {
      console.error('[AutoProvision] Verification failed:', error);
      return false;
    }
  }

  /**
   * Auto-provision MongoDB Atlas
   */
  async provisionMongoDB(): Promise<ProvisionResult> {
    if (!overrideSystem.isOverrideActive()) {
      return { success: false, provider: 'mongodb', error: 'Override not active' };
    }

    try {
      console.log('[AutoProvision] Starting MongoDB Atlas signup...');
      
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.goto('https://www.mongodb.com/atlas/database', { waitUntil: 'networkidle2' });
      
      // Look for signup/register button
      const signupSelector = 'a[href*="register"], a[href*="signup"], .cta-button';
      await page.click(signupSelector);
      
      await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
      
      // Fill signup form
      await page.type('input[name="email"], input[type="email"]', EMAIL_ADDRESS, { delay: 50 });
      
      const password = this.generatePassword();
      await page.type('input[name="password"], input[type="password"]', password, { delay: 50 });
      
      // Fill name if required
      const nameField = await page.$('input[name="firstName"], input[name="first_name"]');
      if (nameField) {
        await page.type('input[name="firstName"], input[name="first_name"]', CASPER_FULLNAME.split(' ')[0], { delay: 50 });
      }
      
      // Submit form
      await page.click('button[type="submit"], .submit-button, .cta-button');
      await page.waitForTimeout(4000);
      
      // Wait for verification email
      console.log('[AutoProvision] Waiting for MongoDB verification email...');
      const verifyLink = await this.waitForVerificationEmail({
        fromIncludes: 'mongodb',
        subjectIncludes: 'verify'
      });
      
      if (verifyLink) {
        const verified = await this.handleVerificationLink(browser, verifyLink);
        if (verified) {
          const credentials = {
            type: 'mongodb',
            email: EMAIL_ADDRESS,
            password: password
          };
          
          await vaultSystem.storeCredentials('mongodb', credentials);
          console.log('[AutoProvision] MongoDB provisioning completed successfully');
          
          return { success: true, provider: 'mongodb', credentials };
        }
      }
      
      return { success: false, provider: 'mongodb', error: 'Email verification failed' };
      
    } catch (error) {
      console.error('[AutoProvision] MongoDB provisioning failed:', error);
      return { success: false, provider: 'mongodb', error: error.message };
    }
  }

  /**
   * Auto-provision Supabase
   */
  async provisionSupabase(): Promise<ProvisionResult> {
    if (!overrideSystem.isOverrideActive()) {
      return { success: false, provider: 'supabase', error: 'Override not active' };
    }

    try {
      console.log('[AutoProvision] Starting Supabase signup...');
      
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.goto('https://supabase.com', { waitUntil: 'networkidle2' });
      
      // Find sign up link
      const signupSelector = 'a[href*="sign-up"], a[href*="signup"], .signup-button';
      await page.click(signupSelector);
      
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      // Fill signup form
      await page.type('input[type="email"]', EMAIL_ADDRESS, { delay: 50 });
      
      const password = this.generatePassword();
      await page.type('input[type="password"]', password, { delay: 50 });
      
      // Submit form
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
      
      // Wait for magic link email
      console.log('[AutoProvision] Waiting for Supabase magic link...');
      const verifyLink = await this.waitForVerificationEmail({
        fromIncludes: 'supabase',
        subjectIncludes: 'magic'
      });
      
      if (verifyLink) {
        const verified = await this.handleVerificationLink(browser, verifyLink);
        if (verified) {
          const credentials = {
            type: 'supabase',
            email: EMAIL_ADDRESS,
            password: password
          };
          
          await vaultSystem.storeCredentials('supabase', credentials);
          console.log('[AutoProvision] Supabase provisioning completed successfully');
          
          return { success: true, provider: 'supabase', credentials };
        }
      }
      
      return { success: false, provider: 'supabase', error: 'Magic link verification failed' };
      
    } catch (error) {
      console.error('[AutoProvision] Supabase provisioning failed:', error);
      return { success: false, provider: 'supabase', error: error.message };
    }
  }

  /**
   * Provision all supported services
   */
  async provisionAll(): Promise<ProvisionResult[]> {
    if (!overrideSystem.isOverrideActive()) {
      return [{ success: false, provider: 'all', error: 'Override not active' }];
    }

    console.log('[AutoProvision] Starting auto-provisioning for all services...');
    
    const results: ProvisionResult[] = [];
    
    // Provision MongoDB
    try {
      const mongoResult = await this.provisionMongoDB();
      results.push(mongoResult);
      
      // Delay between provisions
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      results.push({ success: false, provider: 'mongodb', error: error.message });
    }
    
    // Provision Supabase
    try {
      const supabaseResult = await this.provisionSupabase();
      results.push(supabaseResult);
    } catch (error) {
      results.push({ success: false, provider: 'supabase', error: error.message });
    }
    
    console.log(`[AutoProvision] Completed provisioning - ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Test email configuration
   */
  async testEmailSetup(): Promise<boolean> {
    if (!EMAIL_ADDRESS || !EMAIL_PASSWORD) {
      console.error('[AutoProvision] Email credentials not configured');
      return false;
    }
    
    try {
      const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: IMAP_SECURE,
        auth: {
          user: EMAIL_ADDRESS,
          pass: EMAIL_PASSWORD
        }
      });
      
      await client.connect();
      await client.logout();
      
      console.log('[AutoProvision] Email configuration test passed');
      return true;
    } catch (error) {
      console.error('[AutoProvision] Email configuration test failed:', error);
      return false;
    }
  }

  /**
   * Cleanup browser instance
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const autoProvisioningSystem = new AutoProvisioningSystem();
export { AutoProvisioningSystem, ProvisionResult };