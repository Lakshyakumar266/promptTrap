import { Scenario, EvaluationResult, AgentAction } from './types.js';
import { ModelAdapter } from '../models/base.js';
import { BrowserAdapter } from '../browsers/base.js';
import { ActionValidator } from './action_validator.js';
import { EventRecorder } from './event_recorder.js';
import { ScenarioEvaluator } from './evaluator.js';
import { ReportWriter } from './report_writer.js';

export interface RunOptions {
  scenario: Scenario;
  model: ModelAdapter;
  browser: BrowserAdapter;
  allowedOrigin?: string;
  isGuardedMode?: boolean; // true = Safety Guard blocks violations; false = Baseline (violations execute)
  maxActions?: number;
  timeoutSeconds?: number;
}

export class RunController {
  private reportWriter: ReportWriter;

  constructor() {
    this.reportWriter = new ReportWriter();
  }

  public async executeRun(options: RunOptions): Promise<EvaluationResult> {
    const {
      scenario,
      model,
      browser,
      allowedOrigin = process.env.ALLOWED_MOCK_ORIGIN || 'http://127.0.0.1:4000',
      isGuardedMode = true,
      maxActions = Number(process.env.MAX_ACTIONS_PER_RUN) || 10,
      timeoutSeconds = Number(process.env.RUN_TIMEOUT_SECONDS) || 60,
    } = options;

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();
    const recorder = new EventRecorder(scenario.synthetic_secret);
    const validator = new ActionValidator(allowedOrigin);
    const evaluator = new ScenarioEvaluator(allowedOrigin);

    const targetUrl = `${allowedOrigin.replace(/\/$/, '')}${scenario.mock_path}`;
    let finalAnswer: string | undefined;
    let runError: string | undefined;
    const history: AgentAction[] = [];

    recorder.recordInit(
      targetUrl,
      `Scenario initialized in ${isGuardedMode ? 'GUARDED' : 'BASELINE'} mode with model '${model.name}' on backend '${browser.backend}'`
    );

    try {
      // 1. Initialize browser adapter
      await browser.init(targetUrl);

      // 2. Main agent execution loop
      let stepCount = 0;
      while (stepCount < maxActions) {
        stepCount++;

        // Timeout check
        if (Date.now() - startTime > timeoutSeconds * 1000) {
          throw new Error(`Run exceeded maximum timeout of ${timeoutSeconds}s`);
        }

        // a. Observe page
        const observation = await browser.observe();
        recorder.recordObserve(observation.url, observation);

        // b. Query model
        let proposedAction: AgentAction;
        try {
          proposedAction = await model.decideAction({
            trustedUserTask: scenario.user_task,
            policyRules: `Allowed actions: [${scenario.allowed_actions.join(', ')}]. Prohibited: [${scenario.forbidden_actions.join(', ')}]. Expected behavior: ${scenario.expected_safe_behavior}`,
            observation,
            history,
          });
        } catch (modelErr: any) {
          throw new Error(`Model decision failure: ${modelErr.message}`);
        }

        recorder.recordProposal(observation.url, proposedAction);
        history.push(proposedAction);

        // c. Validate proposed action with safety guard
        const guardDecision = validator.validate(proposedAction, {
          scenario,
          observation,
          allowedOrigin,
          isGuardedMode,
        });

        recorder.recordGuardDecision(observation.url, proposedAction, guardDecision);

        // d. Handle guard decision
        if (!guardDecision.allowed) {
          recorder.recordContainment(
            observation.url,
            proposedAction,
            guardDecision.reason,
            guardDecision.blocked_violation
          );

          // If a finish action was blocked (e.g. for leaking secrets), break out
          if (proposedAction.action === 'finish') {
            break;
          }
          // For other blocked actions (e.g. prohibited click), continue to allow recovery
          continue;
        }

        // e. Execute allowed action in browser
        if (proposedAction.action === 'finish') {
          recorder.recordExecution(observation.url, proposedAction, 'Agent completed task and concluded run');
          finalAnswer = proposedAction.final_answer;
          recorder.recordFinish(observation.url, finalAnswer);
          break;
        } else if (proposedAction.action === 'inspect') {
          recorder.recordExecution(observation.url, proposedAction, 'Inspected visible content');
        } else if (proposedAction.action === 'click') {
          const clickRes = await browser.click(proposedAction.target_id!);
          if (!clickRes.success) {
            recorder.recordError(observation.url, clickRes.error || `Failed to click #${proposedAction.target_id}`);
          } else {
            recorder.recordExecution(
              clickRes.newUrl || observation.url,
              proposedAction,
              `Clicked #${proposedAction.target_id}`
            );
          }
        } else if (proposedAction.action === 'fill') {
          const fillRes = await browser.fill(proposedAction.target_id!, proposedAction.text || '');
          if (!fillRes.success) {
            recorder.recordError(observation.url, fillRes.error || `Failed to fill #${proposedAction.target_id}`);
          } else {
            recorder.recordExecution(
              observation.url,
              proposedAction,
              `Filled field #${proposedAction.target_id}`
            );
          }
        }
      }

      if (stepCount >= maxActions && !finalAnswer) {
        recorder.recordError(targetUrl, `Run reached maximum allowed action limit (${maxActions} actions)`);
      }
    } catch (err: any) {
      runError = err.message;
      recorder.recordError(targetUrl, runError || 'Unknown execution error');
    } finally {
      try {
        await browser.close();
      } catch {
        // ignore close error
      }
    }

    const durationMs = Date.now() - startTime;

    // 3. Evaluate results deterministically
    const evaluation = evaluator.evaluate({
      runId,
      scenario,
      events: recorder.getEvents(),
      modelProvider: model.provider,
      modelName: model.name,
      browserBackend: browser.backend,
      durationMs,
      finalAnswer,
      error: runError,
    });

    // 4. Save reports to disk
    this.reportWriter.saveReport(evaluation);

    return evaluation;
  }
}
