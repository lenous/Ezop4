import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const [inputPath, outputDir = 'migration-output'] = process.argv.slice(2);

if (!inputPath) {
  console.error('Pouziti: npm run migrate:app-state -- export.json ./migration-output');
  process.exit(1);
}

const source = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const state = source.data && source.id === 'main' ? source.data : source;

const rows = {
  profiles: (state.USERS || []).map(userToRow),
  orders: (state.ORDERS || []).map(orderToRow),
  order_documents: (state.ORDERS || []).flatMap(orderDocumentsToRows),
  order_stations: (state.ORDERS || []).flatMap(orderStationsToRows),
  production_notes: (state.PROD_NOTES || []).map(noteToRow),
  issues: (state.ISSUES || []).map(issueToRow),
  issue_recipients: (state.ISSUES || []).flatMap(issueRecipientRows),
  product_memory: Object.entries(state.PRODUCT_MEMORY || {}).map(([key, value]) => ({
    product_key: key,
    customer: value.customer || '',
    name: value.name || '',
    station_programs: value.stationPrograms || {},
    photo_data_url: value.photoDataUrl || null,
    reusable_notes: Array.isArray(value.reusableNotes) ? value.reusableNotes : [],
    updated_at: value.updatedAt || new Date().toISOString(),
  })),
};

const out = resolve(outputDir);
await mkdir(out, { recursive: true });
await Promise.all(Object.entries(rows).map(([name, data]) =>
  writeFile(join(out, `${name}.json`), JSON.stringify(data, null, 2))
));

await writeFile(join(out, 'README.txt'), [
  `Vystup migrace z ${basename(inputPath)}`,
  '',
  'Tyto JSON soubory odpovidaji tabulkam v schema.sql.',
  'V Supabase je lze nahrat pres Table Editor import nebo vlastni seed script.',
  'Pozor: profiles.json je sablona. Pred importem doplnte user_id z auth.users po vytvoreni uctu v Supabase Auth.',
  '',
  ...Object.entries(rows).map(([name, data]) => `${name}: ${data.length} radku`),
  '',
].join('\n'));

console.log(`Hotovo: ${out}`);

function userToRow(user) {
  return {
    user_id: null,
    login: user.login,
    role: user.role || 'operator',
    name: user.name || user.login,
    avatar: user.avatar || '👤',
    color: user.color || '#6b7280',
    station_ids: Array.isArray(user.stationIds) ? user.stationIds.map(Number).filter(Boolean) : [],
    active: true,
  };
}

function orderToRow(order) {
  return {
    id: order.id,
    number: order.number,
    name: order.name,
    customer: order.customer,
    priority: order.priority,
    qty_ordered: Number(order.qty) || 0,
    due_date: order.due || null,
    order_date: order.orderDate || null,
    technology: order.technology || '',
    production_type: order.productionType || '',
    stencil_number: order.stencilNumber || '',
    purchase_order_number: order.purchaseOrderNumber || null,
    product_photo_data_url: order.productPhotoDataUrl || null,
    block_active: Boolean(order.blocked?.active),
    block_category: order.blocked?.category || null,
    block_reason: order.blocked?.reason || null,
    blocked_by_name: order.blocked?.byName || null,
    blocked_at: order.blocked?.at || null,
    unblock_reason: order.blocked?.resolvedReason || null,
    unblocked_by_name: order.blocked?.resolvedByName || null,
    unblocked_at: order.blocked?.resolvedAt || null,
  };
}

function orderDocumentsToRows(order) {
  return (order.documents || []).map(document => ({
    order_id: order.id,
    name: document.name,
    type: document.type,
    size_bytes: Number(document.size) || 0,
  }));
}

function orderStationsToRows(order) {
  return (order.stations || []).map((station, index) => ({
    order_id: order.id,
    station_id: Number(station.stId),
    sequence_no: index + 1,
    status: station.status || 'waiting',
    qty_received: Number(station.qtyReceived) || 0,
    qty_ok: Number(station.qtyOk) || 0,
    qty_rework: Number(station.qtyRework) || 0,
    qty_scrap: Number(station.qtyScrap) || 0,
    queue_rank: Number(station.queueRank) || null,
    program_name: order.stationPrograms?.[String(station.stId)] || null,
    worker_user_id: station.workerUserId || null,
    worker_login: station.workerLogin || null,
    worker_name: station.workerName || null,
    worker_role: station.workerRole || null,
    work_started_at: station.workStartedAt || null,
    work_paused_at: station.workPausedAt || null,
    work_pause_reason: station.workPauseReason || null,
    work_completed_at: station.workCompletedAt || null,
    work_completed_by_name: station.workCompletedByName || null,
  }));
}

function noteToRow(note) {
  return {
    id: note.id,
    order_id: note.orderId,
    station_id: Number(note.stationId),
    target_scope: note.targetScope || 'station',
    target_station_ids: Array.isArray(note.stationIds) ? note.stationIds.map(Number).filter(Boolean) : (note.stationId ? [Number(note.stationId)] : null),
    visibility: note.visibility === 'private' ? 'private' : 'public',
    product_key: note.productKey || null,
    product_sticky: Boolean(note.productSticky),
    product_memory_note_id: note.productMemoryNoteId || null,
    type: note.type || 'info',
    text: note.text || '',
    author_name: note.author || '',
    author_role: note.authorRole || null,
    created_at: note.createdAt || new Date().toISOString(),
  };
}

function issueToRow(issue) {
  return {
    id: issue.id,
    order_id: issue.orderId,
    station_id: Number(issue.stationId),
    severity: issue.severity || 'medium',
    description: issue.description || '',
    reported_by_name: issue.reportedBy || '',
    reported_by_role: issue.reportedByRole || null,
    reported_by_login: issue.reportedByLogin || null,
    target_scope: issue.targetScope || 'all',
    target_label: issue.targetLabel || null,
    auto_key: issue.autoKey || null,
    reported_at: issue.reportedAt || new Date().toISOString(),
    resolved: Boolean(issue.resolved),
    resolved_by_name: issue.resolvedBy || null,
    resolved_at: issue.resolvedAt || null,
  };
}

function issueRecipientRows(issue) {
  if (issue.targetScope === 'all' || (!issue.targetRoles && !issue.targetUserIds && !issue.targetLogins)) {
    return [{ issue_id: issue.id, recipient_type: 'all', recipient_value: '*' }];
  }
  return [
    ...(issue.targetRoles || []).map(role => ({ issue_id: issue.id, recipient_type: 'role', recipient_value: role })),
    ...(issue.targetUserIds || []).map(userId => ({ issue_id: issue.id, recipient_type: 'user', recipient_value: userId })),
    ...(issue.targetLogins || []).map(login => ({ issue_id: issue.id, recipient_type: 'login', recipient_value: login })),
  ];
}
