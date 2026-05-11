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
  '',
  ...Object.entries(rows).map(([name, data]) => `${name}: ${data.length} radku`),
  '',
].join('\n'));

console.log(`Hotovo: ${out}`);

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
    program_name: order.stationPrograms?.[String(station.stId)] || null,
  }));
}

function noteToRow(note) {
  return {
    id: note.id,
    order_id: note.orderId,
    station_id: Number(note.stationId),
    target_scope: note.targetScope || 'station',
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
