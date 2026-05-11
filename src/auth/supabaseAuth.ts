import type { Role, UserProfile } from '../state/types';

export interface SupabaseAuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface AuthProfileRow {
  user_id: string;
  login: string;
  role: Role;
  name: string;
  avatar?: string | null;
  color?: string | null;
  active: boolean;
}

export interface AuthSession {
  user: UserProfile;
  accessToken?: string;
}

export interface AuthPort {
  signIn(login: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  currentSession(): Promise<AuthSession | null>;
}

export type AuthMode = 'demo' | 'supabase';

export interface SupabaseLikeClient {
  auth?: {
    signInWithPassword(input: { email: string; password: string }): Promise<{
      data?: { user?: SupabaseAuthUser | null; session?: { access_token?: string } | null };
      error?: { message?: string } | null;
    }>;
    signOut(): Promise<{ error?: { message?: string } | null }>;
    getSession(): Promise<{
      data?: { session?: { access_token?: string; user?: SupabaseAuthUser | null } | null };
      error?: { message?: string } | null;
    }>;
  };
  from?(table: string): {
    select(columns?: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data?: AuthProfileRow | null; error?: { message?: string } | null }>;
      };
    };
  };
}

export function profileRowToUser(row: AuthProfileRow): UserProfile {
  return {
    id: row.user_id,
    login: row.login,
    role: row.role,
    name: row.name,
    avatar: row.avatar || '👤',
    color: row.color || '#6b7280',
  };
}

export function normalizeLoginForEmail(login: string, internalDomain = 'ezop.local'): string {
  const value = login.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${internalDomain}`;
}

export function createSupabaseAuthPort(client: SupabaseLikeClient, internalDomain = 'ezop.local'): AuthPort {
  return {
    async signIn(login: string, password: string): Promise<AuthSession> {
      if (!client.auth?.signInWithPassword || !client.from) {
        throw new Error('Supabase klient nepodporuje Auth.');
      }
      const email = normalizeLoginForEmail(login, internalDomain);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data?.user) throw new Error(error?.message || 'Přihlášení se nezdařilo.');

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('user_id,login,role,name,avatar,color,active')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message || 'Profil nelze načíst.');
      if (!profile || profile.active === false) throw new Error('Uživatel nemá aktivní profil v tabulce profiles.');

      return {
        user: profileRowToUser(profile),
        accessToken: data.session?.access_token,
      };
    },

    async signOut(): Promise<void> {
      const { error } = await client.auth?.signOut?.() ?? {};
      if (error) throw new Error(error.message || 'Odhlášení se nezdařilo.');
    },

    async currentSession(): Promise<AuthSession | null> {
      if (!client.auth?.getSession || !client.from) return null;
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session?.user) return null;
      const { data: profile } = await client
        .from('profiles')
        .select('user_id,login,role,name,avatar,color,active')
        .eq('user_id', data.session.user.id)
        .maybeSingle();
      return profile && profile.active !== false
        ? { user: profileRowToUser(profile), accessToken: data.session.access_token }
        : null;
    },
  };
}

export const EZOP4_AUTH_MODE_KEY = 'ezop4-auth-mode';

export function readAuthMode(storage: Storage = localStorage): AuthMode {
  return storage.getItem(EZOP4_AUTH_MODE_KEY) === 'supabase' ? 'supabase' : 'demo';
}

export function writeAuthMode(mode: AuthMode, storage: Storage = localStorage): void {
  storage.setItem(EZOP4_AUTH_MODE_KEY, mode);
}
