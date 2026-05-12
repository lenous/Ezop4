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

export async function summarizeOrder(input: OrderAiSummaryInput): Promise<OrderAiSummary> {
  const response = await fetch('/api/ai/order-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseAiErrorMessage(message) || `AI přehled se nepodařilo vytvořit (HTTP ${response.status}).`);
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
