import type { UserProfile } from '../state/types';

export interface AuthResult { ok: boolean; user?: UserProfile; error?: string; }

let activeUser: UserProfile | null = null;

export function currentUser(): UserProfile | null { return activeUser; }
export function logout(): void { activeUser = null; }
export function setCurrentUser(user: UserProfile): void { activeUser = user; }
