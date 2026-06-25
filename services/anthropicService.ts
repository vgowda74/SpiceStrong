import { supabase } from './supabase';

type AnthropicMessageRequest = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: unknown[];
};

export async function invokeAnthropicMessages<T = any>(payload: AnthropicMessageRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
    body: payload,
  });

  if (error) {
    const edgeMessage = await getFunctionErrorMessage(error);
    if (process.env.EXPO_PUBLIC_ANTHROPIC_KEY) {
      return invokeAnthropicDirect<T>(payload, edgeMessage);
    }
    throw new Error(edgeMessage || 'Food analysis is temporarily unavailable. Try again in a moment.');
  }

  if ((data as { error?: string } | null)?.error) {
    const proxyMessage = (data as { error: string }).error;
    if (process.env.EXPO_PUBLIC_ANTHROPIC_KEY) {
      return invokeAnthropicDirect<T>(payload, proxyMessage);
    }
    throw new Error(proxyMessage);
  }

  return data as T;
}

async function getFunctionErrorMessage(error: any): Promise<string> {
  const fallback = error?.message || 'Anthropic proxy failed';
  try {
    const context = error?.context;
    if (!context) return fallback;
    const text = await context.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || fallback;
    } catch {
      return text.slice(0, 220);
    }
  } catch {
    return fallback;
  }
}

async function invokeAnthropicDirect<T>(payload: AnthropicMessageRequest, proxyMessage?: string): Promise<T> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
  if (!apiKey) throw new Error(proxyMessage || 'Anthropic API key is not configured.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || parsed?.error || parsed?.message || text;
    } catch {}
    throw new Error(message || proxyMessage || 'Food analysis failed. Try another photo or use gallery.');
  }

  return JSON.parse(text) as T;
}
