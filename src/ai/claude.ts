import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY || '';

export const claude = new Anthropic({ apiKey });

export const isClaudeReady = Boolean(apiKey && apiKey.length > 5);

export const CLAUDE_MODEL = 'claude-opus-4-8';
