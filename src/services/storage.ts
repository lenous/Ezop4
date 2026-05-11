import type { AppState } from '../state/types';

export const LS_KEY = 'vyrobais_state_v1';

export async function loadState(): Promise<AppState | null> {
  const raw = localStorage.getItem(LS_KEY);
  return raw ? JSON.parse(raw) as AppState : null;
}

export async function saveState(state: AppState): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify({ ...state, LOGIN_LOGS: [], exportedAt: new Date().toISOString() }, null, 2);
}
