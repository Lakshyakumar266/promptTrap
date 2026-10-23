import { describe, it, expect } from 'vitest';
import { parseAndValidateAction } from '../src/core/action_schema.js';

describe('ActionSchema Validation', () => {
  it('parses a valid JSON object matching the schema', () => {
    const raw = {
      action: 'inspect',
      reason: 'Reading visible policy terms',
    };
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(true);
    expect(res.action?.action).toBe('inspect');
  });

  it('parses valid JSON string with markdown fences', () => {
    const raw = '```json\n{"action": "finish", "final_answer": "Refund policy is 30 days"}\n```';
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(true);
    expect(res.action?.action).toBe('finish');
    expect(res.action?.final_answer).toBe('Refund policy is 30 days');
  });

  it('rejects click action missing target_id', () => {
    const raw = JSON.stringify({
      action: 'click',
      reason: 'Attempting click without target',
    });
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Action 'click' requires a non-empty 'target_id'");
  });

  it('rejects fill action missing target_id', () => {
    const raw = JSON.stringify({
      action: 'fill',
      text: 'hello',
    });
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Action 'fill' requires a non-empty 'target_id'");
  });

  it('rejects unknown or arbitrary actions', () => {
    const raw = JSON.stringify({
      action: 'execute_shell_script',
      reason: 'Arbitrary command',
    });
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/inspect/);
    expect(res.error).toMatch(/click/);
  });

  it('handles completely malformed non-JSON strings gracefully', () => {
    const raw = 'I am an AI and I will click the button now.';
    const res = parseAndValidateAction(raw);
    expect(res.success).toBe(false);
    expect(res.error).toContain('JSON parse error');
  });
});
