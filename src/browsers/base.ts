import { PageObservation } from '../core/types.js';

export interface ActionResult {
  success: boolean;
  newUrl?: string;
  error?: string;
}

export interface BrowserAdapter {
  name: string;
  backend: string;
  init(url: string): Promise<void>;
  observe(): Promise<PageObservation>;
  click(targetId: string): Promise<ActionResult>;
  fill(targetId: string, text: string): Promise<ActionResult>;
  navigate(url: string): Promise<ActionResult>;
  close(): Promise<void>;
}
