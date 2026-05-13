export type Role = 'admin' | 'dispatcher' | 'tpv' | 'management' | 'operator';
export type StationStatus = 'waiting' | 'in_progress' | 'partial' | 'completed' | 'issue' | 'skipped';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Permission =
  | 'view_orders'
  | 'edit_qty'
  | 'change_status'
  | 'create_order'
  | 'delete_order'
  | 'manage_order_stations'
  | 'edit_order_info'
  | 'edit_product_memory'
  | 'view_kpi'
  | 'manage_users'
  | 'app_settings';

export interface UserProfile { id: string; login: string; role: Role; name: string; avatar: string; color: string; stationIds?: number[]; }
export interface AppSettings { companyName: string; lockTimeout: number; allowOperatorQty: boolean; showKpiOperator: boolean; requireNoteOnIssue: boolean; notifyOnIssue: boolean; darkMode: boolean; language: string; shiftHours: number; }
export interface StationProgress {
  stId: number;
  status: StationStatus;
  qtyOk: number;
  qtyRework: number;
  qtyScrap: number;
  qtyReceived: number;
  queueRank?: number;
  workerUserId?: string;
  workerLogin?: string;
  workerName?: string;
  workerRole?: Role | '';
  workStartedAt?: string | null;
  workPausedAt?: string | null;
  workPauseReason?: string;
  workCompletedAt?: string | null;
  workCompletedByUserId?: string;
  workCompletedByLogin?: string;
  workCompletedByName?: string;
}
export interface OrderDocument { name: string; type: string; size: number; }
export interface OrderBlock {
  active: boolean;
  category?: 'material' | 'documentation' | 'program' | 'customer' | 'quality' | 'other';
  reason?: string;
  byUserId?: string;
  byLogin?: string;
  byName?: string;
  byRole?: Role;
  at?: string;
  resolvedReason?: string;
  resolvedByUserId?: string;
  resolvedByLogin?: string;
  resolvedByName?: string;
  resolvedByRole?: Role;
  resolvedAt?: string;
}
export interface Order { id: string; number: string; name: string; priority: Priority; qty: number; customer: string; due: string; orderDate: string; technology: string; productionType: string; stencilNumber: string; purchaseOrderNumber?: string; stationPrograms?: Record<string, string>; productPhotoDataUrl?: string; blocked?: OrderBlock; documents: OrderDocument[]; stations: StationProgress[]; }
export interface Issue {
  id: string;
  orderId: string;
  stationId: number;
  severity: string;
  description: string;
  reportedBy: string;
  reportedByUserId?: string;
  reportedByLogin?: string;
  reportedByRole?: Role;
  targetScope?: 'all' | 'roles' | 'user';
  targetRoles?: Role[];
  targetUserIds?: string[];
  targetLogins?: string[];
  targetLabel?: string;
  autoKey?: string;
  reportedAt: string;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
}
export interface ProductionNote {
  id: string;
  orderId: string;
  stationId: number;
  stationIds?: number[];
  sourceStationId?: number;
  targetScope?: 'station' | 'stations' | 'all';
  targetRoles?: Role[];
  visibility?: 'public' | 'private';
  productSticky?: boolean;
  productKey?: string;
  productMemoryNoteId?: string;
  inheritedProductNote?: boolean;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  type: string;
  text: string;
  author: string;
  authorUserId?: string;
  authorLogin?: string;
  authorRole: Role;
  createdAt: string;
}
export interface ProductMemoryEntry { customer: string; name: string; stationPrograms: Record<string, string>; photoDataUrl: string; reusableNotes?: ProductionNote[]; updatedAt: string; }
export type ProductMemory = Record<string, ProductMemoryEntry>;
export interface LoginLog { id: string; at: string; success: boolean; login: string; userId: string | null; name: string; role: Role | null; source: Record<string, string>; }
export interface AuditLog { id: string; at: string; userId: string | null; userName: string; role: Role | null; action: string; entityType: string; entityId: string; summary: string; }
export interface AppState { ORDERS: Order[]; ISSUES: Issue[]; PROD_NOTES: ProductionNote[]; USERS?: UserProfile[]; APP_SETTINGS: AppSettings; NEXT_ORDER_CODE: number; LOGIN_LOGS?: LoginLog[]; PRODUCT_MEMORY: ProductMemory; securityVersion?: number; }
