# Lupa NET Integration Readiness

This document describes how EZOP4 is prepared for a future connection to Lupa NET.

## What Is Known

Public materials describe Lupa NET as a Czech ERP system covering company processes from stock levels to invoicing, including production and storage. Public documentation found during implementation does not provide a stable API contract for production orders, warehouse moves, or manufacturing progress.

Because the API contract is not public, EZOP4 now uses an integration boundary instead of hard-coded Lupa NET calls.

## Integration Boundary

Code entrypoint:

- `src/services/lupaNetIntegration.ts`

Runtime bridge:

- `window.EZOP4_LUPA_NET`

Admin UI:

- Admin → `Lupa NET`

Database readiness:

- `integration_settings`
- `integration_outbox`

## Supported First-Step Modes

- `disabled`: no integration traffic.
- `csv`: JSON/CSV-style export package for validation with the vendor.
- `api`: placeholder for a middleware/API connector URL.

The recommended production shape is a small server-side bridge:

```text
EZOP4 / Supabase -> integration_outbox -> Lupa NET bridge -> Lupa NET
```

This avoids putting Lupa NET credentials or internal ERP endpoints into the browser.

## Default Export Package

Admin can download a JSON package from Admin → Lupa NET. It contains:

- order id and order number
- purchase order number
- customer
- product name
- ordered quantity
- due date
- priority
- technology
- production type
- stencil number
- totals: OK / rework / scrap / received
- stations with status, received, OK, rework, scrap and program name

The export does not include passwords or local login logs.

## Data Mapping Draft

| EZOP4 field | Suggested Lupa NET field | Meaning |
| --- | --- | --- |
| `orderNumber` | `cislo_zakazky` | Production order number |
| `purchaseOrderNumber` | `cislo_objednavky` | Customer/order document number |
| `customer` | `zakaznik` | Customer |
| `productName` | `nazev_vyrobku` | Product name |
| `qtyOrdered` | `objednano_ks` | Ordered quantity |
| `dueDate` | `termin_dodani` | Due date |
| `technology` | `technologie` | Technology |
| `stencilNumber` | `cislo_planzety` | Stencil number |
| `totals.qtyOk` | `ok_ks` | Good pieces |
| `totals.qtyRework` | `oprava_ks` | Rework pieces |
| `totals.qtyScrap` | `zmetek_ks` | Scrap pieces |

## Questions For Lupa NET Vendor

1. Is integration supported through API, database view, CSV import/export, or file exchange?
2. What is the unique key for a production order?
3. Is product identity a product code, order item id, barcode, or text name?
4. Which warehouse/site/company code must be passed from EZOP4?
5. Should EZOP4 send every station progress change or only final completed quantities?
6. How are rework pieces represented in Lupa NET?
7. How are scrap pieces represented in Lupa NET?
8. Does Lupa NET accept station-level program names for machines/AOI/wave soldering?
9. What authentication method should the connector use?
10. What sync frequency is safe for Lupa NET?

## Next Implementation Step

After receiving the vendor contract:

1. Add a concrete adapter in `src/services/lupaNetIntegration.ts` or a server-side bridge.
2. Store endpoint/auth settings server-side, not in browser localStorage.
3. Write outbound events into `integration_outbox` when station counts or statuses change.
4. Add retry handling for failed exports.
5. Add an Admin view for sync history and failed records.
