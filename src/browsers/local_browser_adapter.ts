import { JSDOM, VirtualConsole } from 'jsdom';
import { BrowserAdapter, ActionResult } from './base.js';
import { PageObservation, InteractiveElement } from '../core/types.js';

export class LocalBrowserAdapter implements BrowserAdapter {
  public name: string = 'Local Controlled DOM Browser';
  public backend: string = 'Local (JSDOM / Isolated Context)';
  private currentUrl: string = '';
  private dom: JSDOM | null = null;

  public async init(url: string): Promise<void> {
    await this.loadUrl(url);
  }

  private async loadUrl(url: string): Promise<void> {
    this.currentUrl = url;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const html = await res.text();
      const virtualConsole = new VirtualConsole();
      this.dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        virtualConsole,
      });
    } catch (err: any) {
      throw new Error(`Failed to load page at '${url}': ${err.message}`);
    }
  }

  public async observe(): Promise<PageObservation> {
    if (!this.dom) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const doc = this.dom.window.document;
    const title = doc.title || 'Untitled Document';

    // Extract interactive elements
    const interactiveElements: InteractiveElement[] = [];
    const elements = doc.querySelectorAll('button, input, a[href], select, textarea, [role="button"]');

    elements.forEach((el) => {
      const id = el.id || '';
      if (!id) return; // Only track elements with stable identifiers

      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || undefined;
      const href = el.getAttribute('href') || undefined;
      const text = (el.textContent || el.getAttribute('value') || el.getAttribute('placeholder') || '').trim();

      interactiveElements.push({
        id,
        tag,
        text,
        type,
        href,
      });
    });

    // Extract clean visible text
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    // Remove scripts and hidden elements from visible text calculation
    const hiddenEls = bodyClone.querySelectorAll('script, style, [style*="display:none"], [aria-hidden="true"]');
    hiddenEls.forEach(h => h.remove());

    const visibleText = (bodyClone.textContent || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Check for hidden adversarial text
    let hiddenText: string | undefined;
    const hiddenInstruction = doc.querySelector('#hidden-instruction, [style*="display:none"]');
    if (hiddenInstruction) {
      hiddenText = (hiddenInstruction.textContent || '').trim();
    }

    return {
      url: this.currentUrl,
      title,
      visible_text: visibleText,
      interactive_elements: interactiveElements,
      hidden_text: hiddenText,
    };
  }

  public async click(targetId: string): Promise<ActionResult> {
    if (!this.dom) throw new Error('Browser not initialized');

    const doc = this.dom.window.document;
    const element = doc.getElementById(targetId);

    if (!element) {
      return { success: false, error: `Element #${targetId} not found in DOM` };
    }

    // Handle form submit if element is submit button
    const type = element.getAttribute('type');
    const form = element.closest('form');
    if ((type === 'submit' || element.tagName.toLowerCase() === 'button') && form) {
      const actionUrl = form.getAttribute('action') || this.currentUrl;
      const method = (form.getAttribute('method') || 'GET').toUpperCase();

      if (method === 'POST') {
        const formData: Record<string, string> = {};
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach((input: any) => {
          if (input.name) {
            formData[input.name] = input.value || '';
          }
        });

        // Resolve action URL relative to current URL
        const resolvedUrl = new URL(actionUrl, this.currentUrl).toString();
        try {
          await fetch(resolvedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });
        } catch {
          // ignore network failure in test capture
        }
      }
    }

    // Handle link navigation
    if (element.tagName.toLowerCase() === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        const targetUrl = new URL(href, this.currentUrl).toString();
        await this.loadUrl(targetUrl);
        return { success: true, newUrl: targetUrl };
      }
    }

    // Dispatch standard click
    element.dispatchEvent(new this.dom.window.Event('click', { bubbles: true }));
    return { success: true };
  }

  public async fill(targetId: string, text: string): Promise<ActionResult> {
    if (!this.dom) throw new Error('Browser not initialized');

    const doc = this.dom.window.document;
    const element = doc.getElementById(targetId) as HTMLInputElement | null;

    if (!element) {
      return { success: false, error: `Input element #${targetId} not found in DOM` };
    }

    element.value = text;
    element.setAttribute('value', text);
    element.dispatchEvent(new this.dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new this.dom.window.Event('change', { bubbles: true }));

    return { success: true };
  }

  public async navigate(url: string): Promise<ActionResult> {
    await this.loadUrl(url);
    return { success: true, newUrl: this.currentUrl };
  }

  public async close(): Promise<void> {
    if (this.dom) {
      this.dom.window.close();
      this.dom = null;
    }
  }
}
