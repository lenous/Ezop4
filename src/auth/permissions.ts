import type { Permission, Role, UserProfile } from '../state/types';

const perms: Record<Permission, Role[]> = {
  view_orders: ['operator','tpv','dispatcher','management','admin'],
  edit_qty: ['operator','tpv','dispatcher','management','admin'],
  change_status: ['operator','tpv','dispatcher','management','admin'],
  create_order: ['dispatcher','management','admin'],
  manage_order_stations: ['dispatcher','management','admin'],
  edit_order_info: ['dispatcher','management','admin'],
  edit_product_memory: ['operator','tpv','dispatcher','management','admin'],
  view_kpi: ['dispatcher','management','admin'],
  manage_users: ['admin'],
  app_settings: ['admin'],
};

export function can(user: UserProfile | null, action: Permission): boolean {
  return Boolean(user && perms[action].includes(user.role));
}
