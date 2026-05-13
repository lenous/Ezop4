import type { Issue, Order, ProductionNote } from '../state/types';

export interface OrderAiSummaryInput {
  order: Order;
  issues?: Issue[];
  notes?: ProductionNote[];
}

export interface OrderAiSummary {
  summary: string;
  risks: string[];
  nextSteps: string[];
}

let _lastAiCallAt = 0;
const AI_RATE_LIMIT_MS = 3000;

export async function summarizeOrder(input: OrderAiSummaryInput): Promise<OrderAiSummary> {
  const now = Date.now();
  const elapsed = now - _lastAiCallAt;
  if (elapsed < AI_RATE_LIMIT_MS) {
    const wait = AI_RATE_LIMIT_MS - elapsed;
    throw new Error(`Vyčkejte prosím ${Math.ceil(wait / 1000)} s před dalším voláním AI.`);
  }
  _lastAiCallAt = now;

  const response = await fetch('/api/ai/order-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await response.text();
    const parsed = parseAiErrorMessage(message);
    console.error(`AI request failed (HTTP ${response.status}):`, message);
    throw new Error(parsed || 'AI přehled se nepodařilo vytvořit. Zkuste to prosím znovu.');
  }

  return response.json() as Promise<OrderAiSummary>;
}

function parseAiErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message || raw;
  } catch {
    return raw;
  }
}
