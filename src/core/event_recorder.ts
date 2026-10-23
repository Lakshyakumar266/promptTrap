import { TraceEvent, EventType, AgentAction, GuardDecision, PageObservation } from './types.js';

export class EventRecorder {
  private events: TraceEvent[] = [];
  private seqCounter = 1;
  private secretToRedact?: string;

  constructor(secretToRedact?: string) {
    this.secretToRedact = secretToRedact;
  }

  private sanitize(text?: string, maxLength: number = 300): string | undefined {
    if (!text) return undefined;
    let sanitized = text;
    if (this.secretToRedact && this.secretToRedact.length > 0) {
      sanitized = sanitized.replaceAll(this.secretToRedact, '[REDACTED_SECRET]');
    }
    if (sanitized.length > maxLength) {
      return sanitized.substring(0, maxLength) + '... [truncated]';
    }
    return sanitized;
  }

  private addEvent(
    eventType: EventType,
    url: string,
    payload: {
      proposed_action?: AgentAction;
      guard_decision?: GuardDecision;
      executed_action?: AgentAction;
      observation_excerpt?: string;
      details?: string;
    }
  ): TraceEvent {
    const event: TraceEvent = {
      seq: this.seqCounter++,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      url,
      ...payload,
    };
    this.events.push(event);
    return event;
  }

  public recordInit(url: string, details?: string): TraceEvent {
    return this.addEvent('init', url, { details });
  }

  public recordObserve(url: string, observation: PageObservation): TraceEvent {
    const excerpt = this.sanitize(observation.visible_text, 250);
    return this.addEvent('observe', url, {
      observation_excerpt: excerpt,
      details: `Observed page '${observation.title}' with ${observation.interactive_elements.length} interactive elements`,
    });
  }

  public recordProposal(url: string, proposed: AgentAction): TraceEvent {
    return this.addEvent('propose', url, {
      proposed_action: { ...proposed, text: this.sanitize(proposed.text) },
      details: `Agent proposed action: ${proposed.action}${proposed.target_id ? ` on #${proposed.target_id}` : ''}`,
    });
  }

  public recordGuardDecision(url: string, proposed: AgentAction, decision: GuardDecision): TraceEvent {
    return this.addEvent('guard_decision', url, {
      proposed_action: { ...proposed, text: this.sanitize(proposed.text) },
      guard_decision: decision,
      details: decision.allowed
        ? `Guard approved: ${decision.reason}`
        : `Guard BLOCKED: ${decision.reason} (${decision.blocked_violation || 'violation'})`,
    });
  }

  public recordExecution(url: string, action: AgentAction, details?: string): TraceEvent {
    return this.addEvent('execute', url, {
      executed_action: { ...action, text: this.sanitize(action.text) },
      details: details || `Executed action: ${action.action}`,
    });
  }

  public recordContainment(url: string, proposed: AgentAction, reason: string, violation?: string): TraceEvent {
    return this.addEvent('containment', url, {
      proposed_action: { ...proposed, text: this.sanitize(proposed.text) },
      guard_decision: { allowed: false, reason, blocked_violation: violation },
      details: `System containment engaged: ${reason}`,
    });
  }

  public recordError(url: string, error: string): TraceEvent {
    return this.addEvent('error', url, { details: `Error: ${error}` });
  }

  public recordFinish(url: string, finalAnswer?: string): TraceEvent {
    return this.addEvent('finish', url, {
      details: finalAnswer ? `Run completed. Answer: ${this.sanitize(finalAnswer, 200)}` : 'Run finished without explicit answer',
    });
  }

  public getEvents(): TraceEvent[] {
    return [...this.events];
  }
}
