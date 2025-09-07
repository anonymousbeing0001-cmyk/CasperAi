import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_DIR = path.join(__dirname, '../data/vault');
const PROVIDERS_FILE = path.join(VAULT_DIR, 'providers.json');
const ENCRYPT_KEY = process.env.VAULT_KEY || 'casper_ai_default_vault_key_32chars';

// Ensure vault directory exists
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

interface ServiceCredentials {
  type: string;
  email: string;
  password?: string;
  apiKey?: string;
  serviceAccount?: any;
  metadata?: Record<string, any>;
  createdAt: string;
  lastUpdated: string;
}

interface ProviderVault {
  [providerName: string]: ServiceCredentials;
}

class VaultSystem {
  private memoryCache: ProviderVault | null = null;

  /**
   * Encrypt sensitive data using AES-256-CBC
   */
  private encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', ENCRYPT_KEY);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('[Vault] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    try {
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPT_KEY);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('[Vault] Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Store service credentials securely
   */
  async storeCredentials(providerName: string, credentials: Omit<ServiceCredentials, 'createdAt' | 'lastUpdated'>): Promise<void> {
    try {
      const vault = this.loadVault();
      
      const fullCredentials: ServiceCredentials = {
        ...credentials,
        createdAt: vault[providerName]?.createdAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      vault[providerName] = fullCredentials;
      
      const encrypted = this.encrypt(JSON.stringify(vault));
      fs.writeFileSync(PROVIDERS_FILE, encrypted);
      
      // Update memory cache
      this.memoryCache = vault;
      
      console.log(`[Vault] Stored credentials for ${providerName}`);
    } catch (error) {
      console.error('[Vault] Failed to store credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieve service credentials
   */
  getCredentials(providerName: string): ServiceCredentials | null {
    try {
      const vault = this.loadVault();
      return vault[providerName] || null;
    } catch (error) {
      console.error('[Vault] Failed to retrieve credentials:', error);
      return null;
    }
  }

  /**
   * List all stored providers
   */
  getProviders(): string[] {
    try {
      const vault = this.loadVault();
      return Object.keys(vault);
    } catch (error) {
      console.error('[Vault] Failed to list providers:', error);
      return [];
    }
  }

  /**
   * Remove service credentials
   */
  removeCredentials(providerName: string): boolean {
    try {
      const vault = this.loadVault();
      
      if (vault[providerName]) {
        delete vault[providerName];
        
        const encrypted = this.encrypt(JSON.stringify(vault));
        fs.writeFileSync(PROVIDERS_FILE, encrypted);
        
        // Update memory cache
        this.memoryCache = vault;
        
        console.log(`[Vault] Removed credentials for ${providerName}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Vault] Failed to remove credentials:', error);
      return false;
    }
  }

  /**
   * Load vault from disk
   */
  private loadVault(): ProviderVault {
    // Return cached version if available
    if (this.memoryCache) {
      return this.memoryCache;
    }
    
    try {
      if (fs.existsSync(PROVIDERS_FILE)) {
        const encryptedData = fs.readFileSync(PROVIDERS_FILE, 'utf8');
        const decryptedData = this.decrypt(encryptedData);
        this.memoryCache = JSON.parse(decryptedData);
        return this.memoryCache;
      }
    } catch (error) {
      console.error('[Vault] Failed to load vault, creating new:', error);
    }
    
    // Return empty vault if file doesn't exist or failed to load
    this.memoryCache = {};
    return this.memoryCache;
  }

  /**
   * Test vault encryption/decryption
   */
  testVault(): boolean {
    try {
      const testData = 'vault_test_' + Date.now();
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      const success = testData === decrypted;
      console.log(`[Vault] Encryption test: ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error) {
      console.error('[Vault] Encryption test failed:', error);
      return false;
    }
  }

  /**
   * Get vault statistics
   */
  getStats() {
    const vault = this.loadVault();
    const providers = Object.keys(vault);
    
    return {
      totalProviders: providers.length,
      providers: providers.map(name => ({
        name,
        type: vault[name].type,
        createdAt: vault[name].createdAt,
        lastUpdated: vault[name].lastUpdated
      })),
      vaultHealthy: this.testVault()
    };
  }

  /**
   * Export vault (for backup purposes) - WARNING: Returns unencrypted data
   */
  exportVault(): ProviderVault {
    console.warn('[Vault] WARNING: Exporting unencrypted vault data');
    return this.loadVault();
  }

  /**
   * Import vault data
   */
  importVault(vaultData: ProviderVault): void {
    try {
      const encrypted = this.encrypt(JSON.stringify(vaultData));
      fs.writeFileSync(PROVIDERS_FILE, encrypted);
      this.memoryCache = vaultData;
      console.log(`[Vault] Imported ${Object.keys(vaultData).length} provider credentials`);
    } catch (error) {
      console.error('[Vault] Failed to import vault:', error);
      throw error;
    }
  }

  /**
   * Clear memory cache (force reload from disk)
   */
  clearCache(): void {
    this.memoryCache = null;
  }
}

export const vaultSystem = new VaultSystem();
export { VaultSystem, ServiceCredentials, ProviderVault };