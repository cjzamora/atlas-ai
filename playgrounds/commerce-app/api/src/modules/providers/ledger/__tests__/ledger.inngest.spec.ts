import { LedgerInngestHandlers } from "../ledger.inngest";
import { LedgerService } from "../ledger.service";

export function ledgerInngestSpec() {
  const handler = new LedgerInngestHandlers(new LedgerService());
  return handler.syncOrderJob({
    id: "ord_123",
    cartId: "cart_123",
    fulfillmentStatus: "shipped"
  });
}
