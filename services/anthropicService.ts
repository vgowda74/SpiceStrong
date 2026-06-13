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
    throw new Error(error.message || 'Anthropic proxy failed');
  }

  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }

  return data as T;
}
