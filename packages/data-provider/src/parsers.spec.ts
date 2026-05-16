import { EModelEndpoint } from './schemas';
import { getResponseSender } from './parsers';

describe('getResponseSender', () => {
  it.each([
    'google/gemini-3.1-flash-lite',
    'anthropic/claude-3.7-sonnet',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat',
    'mistralai/mistral-large',
  ])('uses the selected OpenRouter model name for %s', (model) => {
    expect(
      getResponseSender({
        endpoint: 'OpenRouter' as EModelEndpoint,
        endpointType: EModelEndpoint.custom,
        model,
        modelDisplayLabel: 'OpenRouter',
      }),
    ).toBe(model);
  });

  it('lets explicit model labels override OpenRouter model names', () => {
    expect(
      getResponseSender({
        endpoint: 'OpenRouter' as EModelEndpoint,
        endpointType: EModelEndpoint.custom,
        model: 'google/gemini-3.1-flash-lite',
        modelLabel: 'Fast Gemini',
        modelDisplayLabel: 'OpenRouter',
      }),
    ).toBe('Fast Gemini');
  });
});
