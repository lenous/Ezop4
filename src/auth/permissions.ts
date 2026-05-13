import type { Permission, Role, UserProfile } from '../state/types';

const perms: Record<Permission, Role[]> = {
  view_orders: ['operator','tpv','dispatcher','management','admin'],
  edit_qty: ['tpv','dispatcher','management','admin'],
  change_status: ['tpv','dispatcher','management','admin'],
  create_order: ['dispatcher','management','admin'],
  delete_order: ['tpv','dispatcher','management','admin'],
  manage_order_stations: ['dispatcher','management','admin'],
  edit_order_info: ['dispatcher','management','admin'],
  edit_product_memory: ['tpv','dispatcher','management','admin'],
  manage_scrap: ['tpv','dispatcher','management','admin'],
  block_order: ['tpv','dispatcher','management','admin'],
  view_kpi: ['dispatcher','management','admin'],
  manage_users: ['admin'],
  app_settings: ['admin'],
};

export function can(user: UserProfile | null, action: Permission): boolean {
  return Boolean(user && perms[action].includes(user.role));
}
