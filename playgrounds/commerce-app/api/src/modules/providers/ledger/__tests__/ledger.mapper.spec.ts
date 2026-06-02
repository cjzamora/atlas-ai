import { mapOrderToLedgerEntry } from "../ledger.mapper";

export function ledgerMapperSpec() {
  return mapOrderToLedgerEntry({
    id: "ord_123",
    cartId: "cart_123",
    fulfillmentStatus: "packed"
  });
}
