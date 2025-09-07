import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KILL_SWITCH_FILE = path.join(__dirname, '../data/casper_override.json');

// Ensure data directory exists
const dataDir = path.dirname(KILL_SWITCH_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

interface OverrideState {
  active: boolean;
  timestamp: string;
  reason?: string;
  user?: string;
}

class OverrideSystem {
  private overrideActive = false;
  private watchers: (() => void)[] = [];

  constructor() {
    this.loadOverrideState();
    this.startKillSwitchWatcher();
  }

  isOverrideActive(): boolean {
    return this.overrideActive;
  }

  setOverride(active: boolean, reason?: string, user?: string): void {
    this.overrideActive = active;
    
    const state: OverrideState = {
      active,
      timestamp: new Date().toISOString(),
      reason,
      user
    };
    
    try {
      fs.writeFileSync(KILL_SWITCH_FILE, JSON.stringify(state, null, 2));
      console.log(`[Override] Set to ${active ? 'ON' : 'OFF'}${reason ? ` - ${reason}` : ''}`);
      
      // Notify watchers
      this.watchers.forEach(watcher => watcher());
    } catch (error) {
      console.error('[Override] Failed to save state:', error);
    }
  }

  private loadOverrideState(): void {
    try {
      if (fs.existsSync(KILL_SWITCH_FILE)) {
        const data = fs.readFileSync(KILL_SWITCH_FILE, 'utf8');
        const state: OverrideState = JSON.parse(data);
        this.overrideActive = state.active;
        console.log(`[Override] Loaded state: ${this.overrideActive ? 'ON' : 'OFF'}`);
      } else {
        // Default to OFF for safety
        this.setOverride(false, 'Initial state - safety first');
      }
    } catch (error) {
      console.error('[Override] Failed to load state:', error);
      this.overrideActive = false;
    }
  }

  private startKillSwitchWatcher(): void {
    console.log('[KillSwitch] Watcher started - monitoring for shutdown signals');
    
    // Watch for file changes
    if (fs.existsSync(KILL_SWITCH_FILE)) {
      fs.watchFile(KILL_SWITCH_FILE, () => {
        this.loadOverrideState();
      });
    }
    
    // Monitor every 10 seconds
    setInterval(() => {
      if (!this.overrideActive) {
        console.log('[KillSwitch] Override is OFF - autonomous operations paused');
      }
    }, 10000);

    // Handle shutdown signals
    process.on('SIGINT', () => {
      console.log('[KillSwitch] SIGINT received - shutting down safely');
      this.setOverride(false, 'Process shutdown');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('[KillSwitch] SIGTERM received - shutting down safely');
      this.setOverride(false, 'Process shutdown');
      process.exit(0);
    });
  }

  onOverrideChange(callback: () => void): void {
    this.watchers.push(callback);
  }

  getOverrideState(): OverrideState | null {
    try {
      if (fs.existsSync(KILL_SWITCH_FILE)) {
        const data = fs.readFileSync(KILL_SWITCH_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[Override] Failed to read state:', error);
    }
    return null;
  }
}

export const overrideSystem = new OverrideSystem();
export { OverrideSystem, OverrideState };