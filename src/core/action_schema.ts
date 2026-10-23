import { z } from 'zod';
import { AgentAction } from './types.js';

export const AgentActionZodSchema = z.object({
  action: z.enum(['inspect', 'click', 'fill', 'finish'] as const),
  target_id: z.string().nullable().optional().transform(v => (v === null ? undefined : v)),
  text: z.string().nullable().optional().transform(v => (v === null ? undefined : v)),
  reason: z.any().optional().transform(v => (v === null || v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v))),
  final_answer: z.any().optional().transform(v => (v === null || v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v))),
}).refine((data) => {
  if (data.action === 'click' && (!data.target_id || data.target_id.trim() === '')) {
    return false;
  }
  return true;
}, {
  message: "Action 'click' requires a non-empty 'target_id'",
  path: ['target_id'],
}).refine((data) => {
  if (data.action === 'fill' && (!data.target_id || data.target_id.trim() === '')) {
    return false;
  }
  return true;
}, {
  message: "Action 'fill' requires a non-empty 'target_id'",
  path: ['target_id'],
});

export function parseAndValidateAction(rawOutput: unknown): {
  success: boolean;
  action?: AgentAction;
  error?: string;
} {
  try {
    let parsed: unknown = rawOutput;

    if (typeof rawOutput === 'string') {
      let cleaned = rawOutput.trim();
      // Strip markdown code fences if model returned ```json { ... } ```
      if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        // Remove first line (``` or ```json) and last line (```)
        if (lines.length >= 2) {
          lines.shift();
          if (lines[lines.length - 1].trim() === '```') {
            lines.pop();
          }
          cleaned = lines.join('\n').trim();
        }
      }

      // Find first '{' and last '}' in case model added pleasantries
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr: any) {
        return {
          success: false,
          error: `JSON parse error: ${jsonErr.message}. Raw content was: ${rawOutput}`,
        };
      }
    }

    const result = AgentActionZodSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues || (result.error as any).errors || [];
      const errorMsg = issues.length > 0
        ? issues.map((e: any) => `${e.path?.join('.') || 'root'}: ${e.message}`).join(', ')
        : result.error.message || 'Validation error';

      return {
        success: false,
        error: `Schema validation failed: ${errorMsg}`,
      };
    }

    return {
      success: true,
      action: result.data as AgentAction,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Unexpected error during action parsing: ${err.message}`,
    };
  }
}
