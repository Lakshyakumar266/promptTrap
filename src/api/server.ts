import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getAllScenarios, getScenario } from '../scenarios/registry.js';
import { mockSiteRouter } from '../mock_site/server.js';
import { RunController } from '../core/run_controller.js';
import { GemmaAdapter } from '../models/gemma_adapter.js';
import { MockGemmaAdapter } from '../models/mock_gemma_adapter.js';
import { MistralAdapter } from '../models/mistral_adapter.js';
import { LocalBrowserAdapter } from '../browsers/local_browser_adapter.js';
import { BrowserbaseStagehandAdapter } from '../browsers/browserbase_adapter.js';
import { EvaluationResult } from '../core/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const publicDir = path.join(rootDir, 'public');
const reportsDir = path.join(rootDir, 'reports');

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedMockOrigin = process.env.ALLOWED_MOCK_ORIGIN || `http://127.0.0.1:${port}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve documentation site route explicitly
app.get(['/docs', '/docs.html'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'docs.html'));
});

// Mount Controlled Mock Site
app.use('/mock', mockSiteRouter);

// Run history in-memory cache
const runHistory: EvaluationResult[] = [];
const controller = new RunController();

// 1. Health check & integration diagnostics
app.get('/api/health', async (_req: Request, res: Response) => {
  let ollamaStatus = 'unreachable';
  const ollamaUrl = (process.env.MODEL_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');

  try {
    const check = await fetch(`${ollamaUrl}/api/version`, { signal: AbortSignal.timeout(1500) });
    if (check.ok) {
      ollamaStatus = 'connected';
    }
  } catch {
    ollamaStatus = 'offline_or_not_started';
  }

  const browserbaseStatus = process.env.BROWSERBASE_API_KEY ? 'configured' : 'not_configured_local_only';
  const mistralStatus = process.env.MISTRAL_API_KEY ? 'configured' : 'key_missing_or_local_only';

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    allowed_origin: allowedMockOrigin,
    integrations: {
      gemma_ollama: {
        status: ollamaStatus,
        url: ollamaUrl,
        model: process.env.MODEL_NAME || 'gemma:2b',
      },
      mistral: {
        status: mistralStatus,
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      },
      browserbase: {
        status: browserbaseStatus,
      },
      local_browser: {
        status: 'ready',
        type: 'Isolated JSDOM Context',
      },
    },
  });
});

// 2. Scenario registry endpoints
app.get('/api/scenarios', (_req: Request, res: Response) => {
  res.json(getAllScenarios());
});

app.get('/api/scenarios/:id', (req: Request, res: Response) => {
  const scenarioId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return res.status(404).json({ error: `Scenario '${scenarioId}' not found` });
  }
  res.json(scenario);
});

// Helper to instantiate model based on selection
function resolveModel(modelType: string) {
  if (modelType === 'gemma_live') {
    return new GemmaAdapter({
      baseUrl: process.env.MODEL_BASE_URL,
      modelName: process.env.MODEL_NAME,
    });
  } else if (modelType === 'mistral_cloud') {
    return new MistralAdapter({ isOllamaMistral: false });
  } else if (modelType === 'mistral_ollama') {
    return new MistralAdapter({ isOllamaMistral: true });
  } else if (modelType === 'simulator_vulnerable') {
    return new MockGemmaAdapter('vulnerable', 'gemma-vulnerable-baseline-agent');
  } else {
    return new MockGemmaAdapter('compliant', 'gemma-compliant-guarded-agent');
  }
}

// 3. Run execution endpoint
app.post('/api/run', async (req: Request, res: Response) => {
  const {
    scenarioId,
    modelType = 'simulator_compliant',
    isGuardedMode = true,
    browserBackend = 'local',
  } = req.body;

  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return res.status(404).json({ error: `Scenario '${scenarioId}' not found in registry` });
  }

  const model = resolveModel(modelType);

  // Configure Browser
  let browser: any;
  if (browserBackend === 'browserbase') {
    browser = new BrowserbaseStagehandAdapter();
  } else {
    browser = new LocalBrowserAdapter();
  }

  try {
    const result = await controller.executeRun({
      scenario,
      model,
      browser,
      allowedOrigin: allowedMockOrigin,
      isGuardedMode,
    });

    runHistory.unshift(result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Run execution failure: ${err.message}` });
  }
});

// 4. Run all scenarios batch endpoint
app.post('/api/run-all', async (req: Request, res: Response) => {
  const {
    modelType = 'simulator_compliant',
    isGuardedMode = true,
    browserBackend = 'local',
  } = req.body;

  const scenarios = getAllScenarios();
  const results: EvaluationResult[] = [];

  for (const scenario of scenarios) {
    const model = resolveModel(modelType);

    const browser = browserBackend === 'browserbase'
      ? new BrowserbaseStagehandAdapter()
      : new LocalBrowserAdapter();

    try {
      const result = await controller.executeRun({
        scenario,
        model,
        browser,
        allowedOrigin: allowedMockOrigin,
        isGuardedMode,
      });
      results.push(result);
      runHistory.unshift(result);
    } catch (err: any) {
      console.error(`Error running ${scenario.id}:`, err);
    }
  }

  const passCount = results.filter(r => r.overall_result === 'PASS').length;
  const failCount = results.filter(r => r.overall_result === 'FAIL').length;
  const incCount = results.filter(r => r.overall_result === 'INCONCLUSIVE').length;
  const containedCount = results.filter(r => r.system_containment).length;

  res.json({
    timestamp: new Date().toISOString(),
    total: results.length,
    summary: {
      pass: passCount,
      fail: failCount,
      inconclusive: incCount,
      system_containment_rate: `${((containedCount / (results.length || 1)) * 100).toFixed(1)}%`,
    },
    results,
  });
});

// 5. Run history endpoint
app.get('/api/history', (_req: Request, res: Response) => {
  res.json(runHistory.slice(0, 50));
});

// 6. Reports download endpoints
app.get('/api/reports/:id/json', (req: Request, res: Response) => {
  const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const filePath = path.join(reportsDir, `run-${reportId}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Report not found');
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="run-${reportId}.json"`);
  res.sendFile(filePath);
});

app.get('/api/reports/:id/md', (req: Request, res: Response) => {
  const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const filePath = path.join(reportsDir, `run-${reportId}.md`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Report not found');
  }
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="run-${reportId}.md"`);
  res.sendFile(filePath);
});

// Serve frontend UI static files
app.use(express.static(publicDir));
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Export server starter for CLI or programmatic testing
export function startServer(customPort?: number): Promise<{ server: any; port: number; url: string }> {
  const p = customPort || port;
  return new Promise((resolve) => {
    const server = app.listen(p, () => {
      const url = `http://127.0.0.1:${p}`;
      console.log(`🚀 PromptTrap Test Harness running at: ${url}`);
      console.log(`🌐 Mock origin bound to: ${allowedMockOrigin}`);
      resolve({ server, port: p, url });
    });
  });
}

// Auto-start when executed directly
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer();
}

export default app;
