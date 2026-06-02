import { LedgerService } from "./ledger.service";
import type { Order } from "../../orders/order.model";

export class LedgerInngestHandlers {
  constructor(private readonly ledger: LedgerService) {}

  syncOrderJob(order: Order) {
    return this.ledger.syncOrderToLedger(order);
  }
}
