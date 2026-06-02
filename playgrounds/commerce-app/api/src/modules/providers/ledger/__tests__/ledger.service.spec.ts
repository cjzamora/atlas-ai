import { LedgerService } from "../ledger.service";

export function ledgerServiceSpec() {
  const service = new LedgerService();
  return service.syncOrderToLedger({
    id: "ord_123",
    cartId: "cart_123",
    fulfillmentStatus: "shipped"
  });
}
