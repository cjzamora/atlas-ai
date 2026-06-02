import type { Order } from "../../orders/order.model";

export function mapOrderToLedgerEntry(order: Order) {
  return {
    externalId: order.id,
    status: order.fulfillmentStatus,
    source: "commerce-order"
  };
}
