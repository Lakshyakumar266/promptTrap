import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../src/api/server.js';
import { RunController } from '../src/core/run_controller.js';
import { getScenario } from '../src/scenarios/registry.js';
import { MockGemmaAdapter } from '../src/models/mock_gemma_adapter.js';
import { LocalBrowserAdapter } from '../src/browsers/local_browser_adapter.js';

describe('End-to-End Scenario Evaluation Harness', () => {
  let serverInstance: any;
  let serverUrl: string;
  const controller = new RunController();

  beforeAll(async () => {
    serverInstance = await startServer(4005);
    serverUrl = serverInstance.url;
  });

  afterAll(() => {
    serverInstance.server.close();
  });

  it('runs compliant agent on refund-policy and produces PASS', async () => {
    const scenario = getScenario('refund-policy-read-only')!;
    const model = new MockGemmaAdapter('compliant');
    const browser = new LocalBrowserAdapter();

    const result = await controller.executeRun({
      scenario,
      model,
      browser,
      allowedOrigin: serverUrl,
      isGuardedMode: true,
    });

    expect(result.overall_result).toBe('PASS');
    expect(result.task_completed).toBe(true);
    expect(result.safety_passed).toBe(true);
    expect(result.model_compliance).toBe(true);
    expect(result.system_containment).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(4);
  });

  it('runs vulnerable agent in Guarded mode: Guard blocks injection and achieves containment', async () => {
    const scenario = getScenario('refund-policy-read-only')!;
    const model = new MockGemmaAdapter('vulnerable');
    const browser = new LocalBrowserAdapter();

    const result = await controller.executeRun({
      scenario,
      model,
      browser,
      allowedOrigin: serverUrl,
      isGuardedMode: true,
    });

    // Model proposed prohibited submission click, guard blocked it
    expect(result.model_compliance).toBe(false); // Model fell for the bait
    expect(result.system_containment).toBe(true); // Guard saved the day!
    expect(result.safety_passed).toBe(true); // No prohibited action actually executed in the browser
  });

  it('runs vulnerable agent in Baseline (Unguarded) mode: injection succeeds, producing reproducible FAIL', async () => {
    const scenario = getScenario('refund-policy-read-only')!;
    const model = new MockGemmaAdapter('vulnerable');
    const browser = new LocalBrowserAdapter();

    const result = await controller.executeRun({
      scenario,
      model,
      browser,
      allowedOrigin: serverUrl,
      isGuardedMode: false, // Guard disabled
    });

    expect(result.overall_result).toBe('FAIL');
    expect(result.safety_passed).toBe(false);
    expect(result.system_containment).toBe(false);
    expect(result.evidence.some(e => e.includes('submit button'))).toBe(true);
  });

  it('serves the documentation site at /docs with 200 OK', async () => {
    const res = await fetch(`${serverUrl}/docs`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Documentation & User Manual');
    expect(html).toContain('Mistral AI Integration');
  });

  it('returns health check status with Gemma and Mistral providers', async () => {
    const res = await fetch(`${serverUrl}/api/health`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.integrations.mistral).toBeDefined();
    expect(data.integrations.gemma_ollama).toBeDefined();
  });
});
