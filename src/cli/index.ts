#!/usr/bin/env node
import dotenv from 'dotenv';
import { getAllScenarios, getScenario } from '../scenarios/registry.js';
import { RunController } from '../core/run_controller.js';
import { MockGemmaAdapter } from '../models/mock_gemma_adapter.js';
import { GemmaAdapter } from '../models/gemma_adapter.js';
import { LocalBrowserAdapter } from '../browsers/local_browser_adapter.js';
import { startServer } from '../api/server.js';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command) {
    case 'list': {
      console.log('\n🪤  PromptTrap Scenario Registry\n');
      console.log('='.repeat(80));
      const scenarios = getAllScenarios();
      scenarios.forEach((sc, i) => {
        console.log(`${i + 1}. [${sc.risk_level.padEnd(8)}] \x1b[36m${sc.id}\x1b[0m: ${sc.title}`);
        console.log(`   Task: "${sc.user_task}"`);
        console.log(`   Mock: ${sc.mock_path}`);
        console.log('-'.repeat(80));
      });
      console.log(`Total: ${scenarios.length} scenarios registered.\n`);
      break;
    }

    case 'run': {
      const scenarioId = args[1];
      if (!scenarioId) {
        console.error('Error: Please specify a scenario ID. Run "npm run trap list" to see options.');
        process.exit(1);
      }

      const scenario = getScenario(scenarioId);
      if (!scenario) {
        console.error(`Error: Scenario '${scenarioId}' not found.`);
        process.exit(1);
      }

      const isVulnerable = args.includes('--vulnerable');
      const isUnguarded = args.includes('--unguarded');
      const useLiveGemma = args.includes('--gemma');
      const useMistralCloud = args.includes('--mistral');
      const useMistralOllama = args.includes('--mistral-ollama');

      const modelLabel = useMistralCloud
        ? 'Mistral AI Cloud API'
        : useMistralOllama
        ? 'Mistral via Local Ollama'
        : useLiveGemma
        ? 'Live Gemma via Ollama'
        : isVulnerable
        ? 'Gemma Vulnerable Baseline'
        : 'Gemma Compliant Simulator';

      console.log(`\n🪤  Executing Scenario: \x1b[36m${scenario.title}\x1b[0m (${scenario.id})`);
      console.log(`   Mode: ${isUnguarded ? '\x1b[31mBASELINE (UNGUARDED)\x1b[0m' : '\x1b[32mDEFENSE (GUARDED)\x1b[0m'}`);
      console.log(`   Model: ${modelLabel}\n`);

      // Spin up local mock server on free port
      const serverInstance = await startServer(4001);
      const controller = new RunController();

      let model: any;
      if (useMistralCloud) {
        const { MistralAdapter } = await import('../models/mistral_adapter.js');
        model = new MistralAdapter({ isOllamaMistral: false });
      } else if (useMistralOllama) {
        const { MistralAdapter } = await import('../models/mistral_adapter.js');
        model = new MistralAdapter({ isOllamaMistral: true });
      } else if (useLiveGemma) {
        model = new GemmaAdapter();
      } else {
        model = new MockGemmaAdapter(isVulnerable ? 'vulnerable' : 'compliant');
      }

      const browser = new LocalBrowserAdapter();

      try {
        const result = await controller.executeRun({
          scenario,
          model,
          browser,
          allowedOrigin: serverInstance.url,
          isGuardedMode: !isUnguarded,
        });

        console.log('\n' + '='.repeat(80));
        console.log(`RESULT: ${result.overall_result === 'PASS' ? '\x1b[32mPASS\x1b[0m' : result.overall_result === 'FAIL' ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mINCONCLUSIVE\x1b[0m'}`);
        console.log(`Task Completed:     ${result.task_completed ? '✅ Yes' : '❌ No'}`);
        console.log(`Model Compliance:   ${result.model_compliance ? '🛡️ Safe Refusal' : '⚠️ Non-compliant Proposal'}`);
        console.log(`System Containment: ${result.system_containment ? '🔒 Successfully Contained' : '❌ Prohibited Action Executed'}`);
        console.log(`Duration:           ${result.duration_ms} ms`);
        console.log(`Actions Executed:   ${result.action_count}`);
        console.log('='.repeat(80));

        console.log('\nDeterministic Assertions:');
        result.assertion_results.forEach(as => {
          console.log(` ${as.passed ? '✅' : '❌'} [${as.name}]: ${as.message}`);
        });

        if (result.evidence.length > 0) {
          console.log('\nEvidence & Findings:');
          result.evidence.forEach(ev => console.log(` - ${ev}`));
        }

        console.log(`\n📁 Reports saved: reports/run-${result.run_id}.json & .md\n`);
      } finally {
        serverInstance.server.close();
      }
      break;
    }

    case 'run-all': {
      const isVulnerable = args.includes('--vulnerable');
      const isUnguarded = args.includes('--unguarded');

      console.log(`\n🚀  Running Full PromptTrap Benchmark Suite (6 Scenarios)...`);
      console.log(`   Guard Mode: ${isUnguarded ? 'BASELINE UNGUARDED' : 'ACTIVE DEFENSE GUARD'}`);

      const serverInstance = await startServer(4002);
      const controller = new RunController();
      const scenarios = getAllScenarios();
      const results: any[] = [];

      try {
        for (const scenario of scenarios) {
          process.stdout.write(`   Running ${scenario.id.padEnd(30)} ... `);
          const model = new MockGemmaAdapter(isVulnerable ? 'vulnerable' : 'compliant');
          const browser = new LocalBrowserAdapter();

          const result = await controller.executeRun({
            scenario,
            model,
            browser,
            allowedOrigin: serverInstance.url,
            isGuardedMode: !isUnguarded,
          });

          results.push(result);
          const tag = result.overall_result === 'PASS'
            ? '\x1b[32mPASS\x1b[0m'
            : result.overall_result === 'FAIL'
            ? '\x1b[31mFAIL\x1b[0m'
            : '\x1b[33mINCONCLUSIVE\x1b[0m';
          console.log(`${tag} (${result.duration_ms}ms)`);
        }

        const passCount = results.filter(r => r.overall_result === 'PASS').length;
        const failCount = results.filter(r => r.overall_result === 'FAIL').length;
        const incCount = results.filter(r => r.overall_result === 'INCONCLUSIVE').length;
        const containedCount = results.filter(r => r.system_containment).length;

        console.log('\n' + '='.repeat(80));
        console.log('BENCHMARK SUMMARY:');
        console.log(`Total Scenarios:     ${results.length}`);
        console.log(`Passed:              ${passCount}`);
        console.log(`Failed:              ${failCount}`);
        console.log(`Inconclusive:        ${incCount}`);
        console.log(`Containment Rate:    ${((containedCount / results.length) * 100).toFixed(1)}%`);
        console.log('='.repeat(80) + '\n');
      } finally {
        serverInstance.server.close();
      }
      break;
    }

    case 'report': {
      const runId = args[1];
      if (!runId) {
        console.error('Error: Please specify run ID. Example: npm run trap report <run-id>');
        process.exit(1);
      }
      const filePath = path.resolve(process.cwd(), 'reports', `run-${runId}.md`);
      if (!fs.existsSync(filePath)) {
        console.error(`Report file '${filePath}' not found.`);
        process.exit(1);
      }
      console.log(fs.readFileSync(filePath, 'utf-8'));
      break;
    }

    case 'help':
    default: {
      console.log(`
🪤 PromptTrap CLI — Reproducible Browser Agent Evaluation

Commands:
  npm run trap -- list                     List all available prompt injection scenarios
  npm run trap -- run <scenario-id>        Run a single scenario with deterministic evaluation
  npm run trap -- run-all                  Run all 6 benchmark scenarios in sequence
  npm run trap -- report <run-id>          Display Markdown report for a specific run

Flags:
  --vulnerable        Use vulnerable agent baseline behavior (simulates attack success)
  --unguarded         Disable safety guard containment (demonstrates security breach)
  --gemma             Use live local Gemma via Ollama (requires Ollama running)
  --mistral           Use Mistral AI Cloud API (requires MISTRAL_API_KEY in .env)
  --mistral-ollama    Use Mistral via local Ollama (requires Ollama running mistral)

Web UI & Documentation:
  npm start           Launch Web Dashboard at http://localhost:4000
  Documentation:      Visit http://localhost:4000/docs for the complete User Manual & Docs
`);
      break;
    }
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
