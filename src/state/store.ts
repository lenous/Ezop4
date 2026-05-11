import type { AppState } from './types';

type Listener = (state: AppState) => void;

let state: AppState | null = null;
const listeners = new Set<Listener>();

export function getState(): AppState | null { return state; }
export function setState(nextState: AppState): void { state = nextState; listeners.forEach(listener => listener(nextState)); }
export function subscribeState(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
