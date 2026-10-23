import { describe, it, expect } from 'vitest';
import { MistralAdapter } from '../src/models/mistral_adapter.js';

describe('MistralAdapter', () => {
  it('throws descriptive configuration error when MISTRAL_API_KEY is missing for cloud API', async () => {
    const adapter = new MistralAdapter({ apiKey: '', isOllamaMistral: false });
    await expect(
      adapter.decideAction({
        trustedUserTask: 'Do task',
        policyRules: 'Allowed',
        observation: {
          url: 'http://localhost/mock',
          title: 'Test',
          visible_text: 'Text',
          interactive_elements: [],
        },
        history: [],
      })
    ).rejects.toThrow('Mistral AI API key is not configured');
  });

  it('correctly sets up Ollama mode with local endpoint', () => {
    const adapter = new MistralAdapter({ isOllamaMistral: true, modelName: 'mistral:7b' });
    expect(adapter.name).toBe('mistral:7b');
    expect(adapter.provider).toContain('Ollama');
  });

  it('correctly sets up Cloud API mode with custom model name', () => {
    const adapter = new MistralAdapter({ apiKey: 'fake-key', modelName: 'codestral-latest' });
    expect(adapter.name).toBe('codestral-latest');
    expect(adapter.provider).toContain('Mistral AI');
  });
});
