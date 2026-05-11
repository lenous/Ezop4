export type StationLike = {
  qtyOk?: number;
  qtyRework?: number;
  qtyScrap?: number;
  qtyReceived?: number;
};

export type OrderLike = {
  qty?: number;
  stations?: StationLike[];
};

export type QtyValidation = {
  sum: number;
  available: number;
  exceed: boolean;
  remaining: number;
};

const positiveNumber = (value: unknown) => Math.max(0, Number(value) || 0);

export function orderGoodQty(order: OrderLike): number {
  const stations = Array.isArray(order.stations) ? order.stations : [];
  const maxOk = Math.max(0, ...stations.map(station => positiveNumber(station.qtyOk)));
  return Math.min(positiveNumber(order.qty), maxOk);
}

export function qtyAvailable(order: OrderLike, station: StationLike): number {
  const received = positiveNumber(station.qtyReceived);
  return received > 0 ? received : positiveNumber(order.qty);
}

export function qtyValidation(order: OrderLike, station: StationLike): QtyValidation {
  const sum = positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework) + positiveNumber(station.qtyScrap);
  const available = qtyAvailable(order, station);
  return { sum, available, exceed: sum > available, remaining: available - sum };
}

export function readyForNextStation(station: StationLike): number {
  return positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework);
}
