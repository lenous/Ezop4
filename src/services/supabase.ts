import type { AppState } from '../state/types';

export const DEFAULT_SUPABASE_URL = 'https://fiiaiooxwegrdtlpwqey.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_cT376Yp4F0nnbBeGLbu71Q_6mMLlVFN';
export const CLOUD_ROW_ID = 'main';

export type CloudState = Omit<AppState, 'USERS' | 'LOGIN_LOGS'>;

export function toCloudState(state: AppState): CloudState {
  const { USERS: _users, LOGIN_LOGS: _logs, ...cloud } = state;
  return cloud;
}
