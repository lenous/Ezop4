import type { Role } from '../state/types';

export const AUDIT_LOG_KEY = 'ezop4-audit-log-v1';

export interface AuditUser {
  id: string;
  name: string;
  role: Role;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  role: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditInput {
  user?: AuditUser | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditSupabaseClient {
  from?(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error?: { message?: string } | null }>;
  };
}

export function readAuditLog(storage: Storage = localStorage): AuditEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(AUDIT_LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAuditLog(entries: AuditEntry[], storage: Storage = localStorage): void {
  storage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries.slice(0, 500)));
}

export async function recordAudit(input: AuditInput, client?: AuditSupabaseClient | null): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: `al${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    userId: input.user?.id || null,
    userName: input.user?.name || 'Systém',
    role: input.user?.role || null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: input.before,
    after: input.after,
  };

  const entries = [entry, ...readAuditLog()].slice(0, 500);
  writeAuditLog(entries);

  if (client?.from) {
    try {
      await client.from('audit_logs').insert({
        user_id: entry.userId,
        user_name: entry.userName,
        role: entry.role,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        summary: entry.summary,
        before_data: entry.before ?? null,
        after_data: entry.after ?? null,
        created_at: entry.at,
      });
    } catch (error) {
      console.warn('Audit cloud write failed:', error);
    }
  }

  return entry;
}

export function clearAuditLog(storage: Storage = localStorage): void {
  storage.removeItem(AUDIT_LOG_KEY);
}
