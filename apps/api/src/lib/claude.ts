import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model configuration
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface ClaudeRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt: string;
  userPrompt: string;
}

export interface ClaudeResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawResponse?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Call Claude API with retry logic and JSON validation
 */
export async function callClaude<T>(
  options: ClaudeRequestOptions,
  schema: z.ZodSchema<T>
): Promise<ClaudeResponse<T>> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    systemPrompt,
    userPrompt,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Claude] Attempt ${attempt}/${MAX_RETRIES} - Model: ${model}`);

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      const rawResponse = textContent.text;
      console.log(`[Claude] Raw response length: ${rawResponse.length} chars`);

      // Parse JSON from response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate against schema
      const validated = schema.parse(parsed);

      return {
        success: true,
        data: validated,
        rawResponse,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      lastError = error as Error;
      console.error(`[Claude] Attempt ${attempt} failed:`, lastError.message);

      // Don't retry on validation errors - the response format is wrong
      if (error instanceof z.ZodError) {
        console.error('[Claude] Schema validation failed:', error.errors);
        return {
          success: false,
          error: `Schema validation failed: ${JSON.stringify(error.errors)}`,
        };
      }

      // Retry on API errors
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`[Claude] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error after retries',
  };
}

/**
 * Simple call without schema validation (for debugging)
 */
export async function callClaudeRaw(options: ClaudeRequestOptions): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    systemPrompt,
    userPrompt,
  } = options;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }

  return textContent.text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { anthropic };

