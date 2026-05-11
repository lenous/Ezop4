import type { AppState, Order, StationProgress } from '../state/types';

export type LupaNetMode = 'disabled' | 'csv' | 'api';
export type LupaNetDirection = 'import_orders' | 'export_progress' | 'bidirectional';

export interface LupaNetConfig {
  enabled: boolean;
  mode: LupaNetMode;
  direction: LupaNetDirection;
  apiBaseUrl: string;
  companyCode: string;
  orderNumberField: string;
  productCodeField: string;
  lastSyncAt?: string;
}

export interface LupaNetStationExport {
  stationId: number;
  status: string;
  qtyReceived: number;
  qtyOk: number;
  qtyRework: number;
  qtyScrap: number;
  programName?: string;
}

export interface LupaNetOrderExport {
  ezopOrderId: string;
  orderNumber: string;
  purchaseOrderNumber: string;
  customer: string;
  productName: string;
  qtyOrdered: number;
  dueDate: string;
  priority: string;
  technology: string;
  productionType: string;
  stencilNumber: string;
  totals: {
    qtyOk: number;
    qtyRework: number;
    qtyScrap: number;
    qtyReceived: number;
  };
  stations: LupaNetStationExport[];
}

export interface LupaNetPackage {
  format: 'ezop4-lupanet-export';
  version: 1;
  generatedAt: string;
  config: Pick<LupaNetConfig, 'mode' | 'direction' | 'companyCode' | 'orderNumberField' | 'productCodeField'>;
  orders: LupaNetOrderExport[];
}

export interface LupaNetReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export const LUPA_NET_CONFIG_KEY = 'ezop4-lupanet-config-v1';

export const DEFAULT_LUPA_NET_CONFIG: LupaNetConfig = {
  enabled: false,
  mode: 'disabled',
  direction: 'export_progress',
  apiBaseUrl: '',
  companyCode: '',
  orderNumberField: 'cislo_zakazky',
  productCodeField: 'kod_vyrobku',
};

export const LUPA_NET_FIELD_MAP = [
  ['orderNumber', 'cislo_zakazky', 'Číslo výrobní zakázky'],
  ['purchaseOrderNumber', 'cislo_objednavky', 'Číslo objednávky'],
  ['customer', 'zakaznik', 'Zákazník'],
  ['productName', 'nazev_vyrobku', 'Název výrobku'],
  ['qtyOrdered', 'objednano_ks', 'Objednané množství'],
  ['dueDate', 'termin_dodani', 'Termín dodání'],
  ['technology', 'technologie', 'Technologie'],
  ['stencilNumber', 'cislo_planzety', 'Číslo planžety'],
  ['totals.qtyOk', 'ok_ks', 'OK kusy'],
  ['totals.qtyRework', 'oprava_ks', 'Kusy na opravu'],
  ['totals.qtyScrap', 'zmetek_ks', 'Zmetky'],
] as const;

export function readLupaNetConfig(storage: Storage = localStorage): LupaNetConfig {
  try {
    const parsed = JSON.parse(storage.getItem(LUPA_NET_CONFIG_KEY) || 'null');
    return { ...DEFAULT_LUPA_NET_CONFIG, ...(parsed || {}) };
  } catch {
    return DEFAULT_LUPA_NET_CONFIG;
  }
}

export function writeLupaNetConfig(config: LupaNetConfig, storage: Storage = localStorage): void {
  storage.setItem(LUPA_NET_CONFIG_KEY, JSON.stringify({ ...DEFAULT_LUPA_NET_CONFIG, ...config }));
}

export function orderTotals(order: Order): LupaNetOrderExport['totals'] {
  return order.stations.reduce(
    (totals, station) => ({
      qtyOk: totals.qtyOk + station.qtyOk,
      qtyRework: totals.qtyRework + station.qtyRework,
      qtyScrap: totals.qtyScrap + station.qtyScrap,
      qtyReceived: Math.max(totals.qtyReceived, station.qtyReceived),
    }),
    { qtyOk: 0, qtyRework: 0, qtyScrap: 0, qtyReceived: 0 },
  );
}

export function stationToLupaNet(station: StationProgress, order: Order): LupaNetStationExport {
  return {
    stationId: station.stId,
    status: station.status,
    qtyReceived: station.qtyReceived,
    qtyOk: station.qtyOk,
    qtyRework: station.qtyRework,
    qtyScrap: station.qtyScrap,
    programName: order.stationPrograms?.[station.stId],
  };
}

export function orderToLupaNet(order: Order): LupaNetOrderExport {
  return {
    ezopOrderId: order.id,
    orderNumber: order.number,
    purchaseOrderNumber: order.purchaseOrderNumber || '',
    customer: order.customer,
    productName: order.name,
    qtyOrdered: order.qty,
    dueDate: order.due,
    priority: order.priority,
    technology: order.technology,
    productionType: order.productionType,
    stencilNumber: order.stencilNumber,
    totals: orderTotals(order),
    stations: order.stations.map(station => stationToLupaNet(station, order)),
  };
}

export function buildLupaNetPackage(state: AppState, config: LupaNetConfig = readLupaNetConfig()): LupaNetPackage {
  return {
    format: 'ezop4-lupanet-export',
    version: 1,
    generatedAt: new Date().toISOString(),
    config: {
      mode: config.mode,
      direction: config.direction,
      companyCode: config.companyCode,
      orderNumberField: config.orderNumberField,
      productCodeField: config.productCodeField,
    },
    orders: state.ORDERS.map(orderToLupaNet),
  };
}

export function lupaNetReadiness(config: LupaNetConfig = readLupaNetConfig()): LupaNetReadinessItem[] {
  const usesApi = config.mode === 'api';
  return [
    {
      id: 'mode',
      label: 'Režim integrace',
      ok: config.enabled && config.mode !== 'disabled',
      detail: config.enabled && config.mode !== 'disabled'
        ? `Připraven režim ${config.mode.toUpperCase()}.`
        : 'Integrace je zatím vypnutá.',
    },
    {
      id: 'direction',
      label: 'Směr toku dat',
      ok: Boolean(config.direction),
      detail: directionLabel(config.direction),
    },
    {
      id: 'api',
      label: 'API / export cesta',
      ok: !usesApi || Boolean(config.apiBaseUrl),
      detail: usesApi
        ? (config.apiBaseUrl || 'Pro API režim chybí URL Lupa NET konektoru.')
        : 'CSV/JSON export nevyžaduje endpoint.',
    },
    {
      id: 'company',
      label: 'Identifikace firmy',
      ok: Boolean(config.companyCode),
      detail: config.companyCode || 'Doplnit kód firmy/střediska z Lupa NET.',
    },
    {
      id: 'mapping',
      label: 'Mapování polí',
      ok: Boolean(config.orderNumberField && config.productCodeField),
      detail: `${config.orderNumberField} / ${config.productCodeField}`,
    },
  ];
}

export function directionLabel(direction: LupaNetDirection): string {
  return {
    import_orders: 'Lupa NET → EZOP4: zakázky a základní údaje.',
    export_progress: 'EZOP4 → Lupa NET: průběh výroby, počty a stavy.',
    bidirectional: 'Obousměrně: zakázky z Lupa NET, průběh zpět.',
  }[direction];
}
