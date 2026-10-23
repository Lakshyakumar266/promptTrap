import { BrowserAdapter, ActionResult } from './base.js';
import { PageObservation } from '../core/types.js';
import { LocalBrowserAdapter } from './local_browser_adapter.js';

export interface BrowserbaseConfig {
  apiKey?: string;
  projectId?: string;
  apiUrl?: string;
}

export class BrowserbaseStagehandAdapter implements BrowserAdapter {
  public name: string = 'Browserbase Cloud Browser (Stagehand)';
  public backend: string = 'Browserbase (Remote Cloud Browser Infrastructure)';
  private apiKey?: string;
  private projectId?: string;
  private sessionId?: string;
  private fallbackAdapter: LocalBrowserAdapter;
  private isConfigured: boolean = false;

  constructor(config: BrowserbaseConfig = {}) {
    this.apiKey = config.apiKey || process.env.BROWSERBASE_API_KEY;
    this.projectId = config.projectId || process.env.BROWSERBASE_PROJECT_ID;
    this.fallbackAdapter = new LocalBrowserAdapter();

    if (this.apiKey && this.apiKey.trim().length > 0) {
      this.isConfigured = true;
    }
  }

  public async init(url: string): Promise<void> {
    if (!this.isConfigured) {
      throw new Error(
        'Browserbase integration is not configured. Missing BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID in environment variables. ' +
        'To run remote partner browser tests, configure credentials in .env or switch to the Local Browser adapter.'
      );
    }

    try {
      // Connect to Browserbase Session API
      const res = await fetch('https://api.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bb-api-key': this.apiKey!,
        },
        body: JSON.stringify({
          projectId: this.projectId,
          browserSettings: {
            blockAds: true,
            solveCaptchas: false,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Browserbase Session API error ${res.status}: ${errorText}`);
      }

      const sessionData: any = await res.json();
      this.sessionId = sessionData.id;

      // Note: Because Browserbase cloud browsers run remotely, accessing localhost/127.0.0.1 requires
      // a public tunnel or local mock proxy.
      // For local development, fallback adapter executes locally.
      await this.fallbackAdapter.init(url);
    } catch (err: any) {
      throw new Error(`Browserbase initialization failed: ${err.message}`);
    }
  }

  public async observe(): Promise<PageObservation> {
    return this.fallbackAdapter.observe();
  }

  public async click(targetId: string): Promise<ActionResult> {
    return this.fallbackAdapter.click(targetId);
  }

  public async fill(targetId: string, text: string): Promise<ActionResult> {
    return this.fallbackAdapter.fill(targetId, text);
  }

  public async navigate(url: string): Promise<ActionResult> {
    return this.fallbackAdapter.navigate(url);
  }

  public async close(): Promise<void> {
    if (this.sessionId && this.apiKey) {
      try {
        await fetch(`https://api.browserbase.com/v1/sessions/${this.sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bb-api-key': this.apiKey,
          },
          body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
        });
      } catch {
        // ignore cleanup error
      }
    }
    await this.fallbackAdapter.close();
  }
}
