import type { AppState, Issue, Order, ProductionNote } from '../state/types';

export interface Ezop4TableExport {
  orders: OrderRow[];
  order_documents: OrderDocumentRow[];
  order_stations: OrderStationRow[];
  production_notes: ProductionNoteRow[];
  issues: IssueRow[];
  issue_recipients: IssueRecipientRow[];
  product_memory: ProductMemoryRow[];
}

export interface OrderRow {
  id: string;
  number: string;
  name: string;
  customer: string;
  priority: string;
  qty_ordered: number;
  due_date: string;
  order_date: string;
  technology: string;
  production_type: string;
  stencil_number: string;
  purchase_order_number: string | null;
  product_photo_data_url: string | null;
}

export interface OrderDocumentRow {
  order_id: string;
  name: string;
  type: string;
  size_bytes: number;
}

export interface OrderStationRow {
  order_id: string;
  station_id: number;
  sequence_no: number;
  status: string;
  qty_received: number;
  qty_ok: number;
  qty_rework: number;
  qty_scrap: number;
  program_name: string | null;
}

export interface ProductionNoteRow {
  id: string;
  order_id: string;
  station_id: number;
  target_scope: string;
  type: string;
  text: string;
  author_name: string;
  author_role: string;
  created_at: string;
}

export interface IssueRow {
  id: string;
  order_id: string;
  station_id: number;
  severity: string;
  description: string;
  reported_by_name: string;
  reported_by_role: string | null;
  reported_by_login: string | null;
  target_scope: string;
  target_label: string | null;
  auto_key: string | null;
  reported_at: string;
  resolved: boolean;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

export interface IssueRecipientRow {
  issue_id: string;
  recipient_type: 'role' | 'user' | 'login' | 'all';
  recipient_value: string;
}

export interface ProductMemoryRow {
  product_key: string;
  customer: string;
  name: string;
  station_programs: Record<string, string>;
  photo_data_url: string | null;
  updated_at: string;
}

export function appStateToEzop4Tables(state: AppState): Ezop4TableExport {
  return {
    orders: state.ORDERS.map(orderToRow),
    order_documents: state.ORDERS.flatMap(orderDocumentsToRows),
    order_stations: state.ORDERS.flatMap(orderStationsToRows),
    production_notes: state.PROD_NOTES.map(noteToRow),
    issues: state.ISSUES.map(issueToRow),
    issue_recipients: state.ISSUES.flatMap(issueRecipientRows),
    product_memory: Object.entries(state.PRODUCT_MEMORY || {}).map(([key, value]) => ({
      product_key: key,
      customer: value.customer,
      name: value.name,
      station_programs: value.stationPrograms || {},
      photo_data_url: value.photoDataUrl || null,
      updated_at: value.updatedAt,
    })),
  };
}

function orderToRow(order: Order): OrderRow {
  return {
    id: order.id,
    number: order.number,
    name: order.name,
    customer: order.customer,
    priority: order.priority,
    qty_ordered: order.qty,
    due_date: order.due,
    order_date: order.orderDate,
    technology: order.technology,
    production_type: order.productionType,
    stencil_number: order.stencilNumber,
    purchase_order_number: order.purchaseOrderNumber || null,
    product_photo_data_url: order.productPhotoDataUrl || null,
  };
}

function orderDocumentsToRows(order: Order): OrderDocumentRow[] {
  return (order.documents || []).map(document => ({
    order_id: order.id,
    name: document.name,
    type: document.type,
    size_bytes: document.size,
  }));
}

function orderStationsToRows(order: Order): OrderStationRow[] {
  return (order.stations || []).map((station, index) => ({
    order_id: order.id,
    station_id: station.stId,
    sequence_no: index + 1,
    status: station.status,
    qty_received: station.qtyReceived || 0,
    qty_ok: station.qtyOk || 0,
    qty_rework: station.qtyRework || 0,
    qty_scrap: station.qtyScrap || 0,
    program_name: order.stationPrograms?.[String(station.stId)] || null,
  }));
}

function noteToRow(note: ProductionNote): ProductionNoteRow {
  return {
    id: note.id,
    order_id: note.orderId,
    station_id: note.stationId,
    target_scope: note.targetScope || 'station',
    type: note.type,
    text: note.text,
    author_name: note.author,
    author_role: note.authorRole,
    created_at: note.createdAt,
  };
}

function issueToRow(issue: Issue): IssueRow {
  return {
    id: issue.id,
    order_id: issue.orderId,
    station_id: issue.stationId,
    severity: issue.severity,
    description: issue.description,
    reported_by_name: issue.reportedBy,
    reported_by_role: issue.reportedByRole || null,
    reported_by_login: issue.reportedByLogin || null,
    target_scope: issue.targetScope || 'all',
    target_label: issue.targetLabel || null,
    auto_key: issue.autoKey || null,
    reported_at: issue.reportedAt,
    resolved: Boolean(issue.resolved),
    resolved_by_name: issue.resolvedBy || null,
    resolved_at: issue.resolvedAt || null,
  };
}

function issueRecipientRows(issue: Issue): IssueRecipientRow[] {
  if (issue.targetScope === 'all' || (!issue.targetRoles && !issue.targetUserIds && !issue.targetLogins)) {
    return [{ issue_id: issue.id, recipient_type: 'all', recipient_value: '*' }];
  }
  return [
    ...(issue.targetRoles || []).map(role => ({ issue_id: issue.id, recipient_type: 'role' as const, recipient_value: role })),
    ...(issue.targetUserIds || []).map(userId => ({ issue_id: issue.id, recipient_type: 'user' as const, recipient_value: userId })),
    ...(issue.targetLogins || []).map(login => ({ issue_id: issue.id, recipient_type: 'login' as const, recipient_value: login })),
  ];
}
