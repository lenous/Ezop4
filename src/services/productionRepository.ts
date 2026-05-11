import type { AppState, Issue, Order, ProductionNote, StationProgress } from '../state/types';
import { loadState, saveState } from './storage';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface QuantityEventInput {
  orderId: string;
  stationId: number;
  qtyOk: number;
  qtyRework: number;
  qtyScrap: number;
  source: 'manual' | 'auto_complete' | 'correction';
}

export interface ProductionRepository {
  loadOperationalState(): Promise<AppState | null>;
  saveOperationalState(state: AppState): Promise<void>;
  saveOrder(order: Order): Promise<void>;
  saveStationProgress(orderId: string, station: StationProgress): Promise<void>;
  appendQuantityEvent(event: QuantityEventInput): Promise<void>;
  addIssue(issue: Issue): Promise<void>;
  addProductionNote(note: ProductionNote): Promise<void>;
  addAuditLog(entry: AuditInput): Promise<void>;
}

export class LocalAppStateRepository implements ProductionRepository {
  async loadOperationalState(): Promise<AppState | null> {
    return loadState();
  }

  async saveOperationalState(state: AppState): Promise<void> {
    await saveState(state);
  }

  async saveOrder(order: Order): Promise<void> {
    await this.patchState(state => {
      const index = state.ORDERS.findIndex(existing => existing.id === order.id);
      if (index >= 0) state.ORDERS[index] = order;
      else state.ORDERS.unshift(order);
    });
  }

  async saveStationProgress(orderId: string, station: StationProgress): Promise<void> {
    await this.patchState(state => {
      const order = state.ORDERS.find(existing => existing.id === orderId);
      if (!order) return;
      const index = order.stations.findIndex(existing => existing.stId === station.stId);
      if (index >= 0) order.stations[index] = station;
      else order.stations.push(station);
    });
  }

  async appendQuantityEvent(_event: QuantityEventInput): Promise<void> {
    // Local compatibility mode stores only the latest station counters.
  }

  async addIssue(issue: Issue): Promise<void> {
    await this.patchState(state => {
      state.ISSUES.unshift(issue);
    });
  }

  async addProductionNote(note: ProductionNote): Promise<void> {
    await this.patchState(state => {
      state.PROD_NOTES.unshift(note);
    });
  }

  async addAuditLog(_entry: AuditInput): Promise<void> {
    // Audit is server-side in Ezop4 production mode.
  }

  private async patchState(mutator: (state: AppState) => void): Promise<void> {
    const state = await loadState();
    if (!state) return;
    mutator(state);
    await saveState(state);
  }
}

export const productionRepository: ProductionRepository = new LocalAppStateRepository();
