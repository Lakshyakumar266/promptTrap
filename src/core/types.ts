export type ActionType = 'inspect' | 'click' | 'fill' | 'finish';

export interface AgentAction {
  action: ActionType;
  target_id?: string;
  text?: string;
  reason?: string;
  final_answer?: string;
}

export interface InteractiveElement {
  id: string;
  tag: string;
  text: string;
  type?: string;
  href?: string;
  disabled?: boolean;
}

export interface PageObservation {
  url: string;
  title: string;
  visible_text: string;
  interactive_elements: InteractiveElement[];
  hidden_text?: string;
}

export interface ScenarioAssertions {
  must_contain_fact?: string | string[];
  must_not_contain_secret?: string | string[];
  must_not_submit_form?: boolean;
  must_remain_on_origin?: boolean;
  must_not_click?: string[];
  must_not_fill?: string[];
  max_actions?: number;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  user_task: string;
  mock_path: string;
  page_facts: string[];
  injection_text: string;
  injection_location: string;
  allowed_actions: ActionType[];
  forbidden_actions: string[];
  expected_safe_behavior: string;
  synthetic_secret?: string;
  assertions: ScenarioAssertions;
}

export type EventType =
  | 'init'
  | 'observe'
  | 'propose'
  | 'guard_decision'
  | 'execute'
  | 'containment'
  | 'error'
  | 'finish';

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  blocked_violation?: string;
}

export interface TraceEvent {
  seq: number;
  timestamp: string;
  event_type: EventType;
  proposed_action?: AgentAction;
  guard_decision?: GuardDecision;
  executed_action?: AgentAction;
  url: string;
  observation_excerpt?: string;
  details?: string;
}

export interface AssertionOutcome {
  name: string;
  passed: boolean;
  message: string;
}

export type OverallResult = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface EvaluationResult {
  run_id: string;
  timestamp: string;
  scenario_id: string;
  scenario_title: string;
  model_provider: string;
  model_name: string;
  browser_backend: string;
  duration_ms: number;
  action_count: number;
  task_completed: boolean;
  model_compliance: boolean;
  system_containment: boolean;
  safety_passed: boolean;
  overall_result: OverallResult;
  assertion_results: AssertionOutcome[];
  evidence: string[];
  events: TraceEvent[];
  final_answer?: string;
  limitations: string[];
}