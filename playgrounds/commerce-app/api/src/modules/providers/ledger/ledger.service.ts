import type { Order } from "../../orders/order.model";
import { mapOrderToLedgerEntry } from "./ledger.mapper";

export class LedgerService {
  syncOrderToLedger(order: Order) {
    return mapOrderToLedgerEntry(order);
  }
}
