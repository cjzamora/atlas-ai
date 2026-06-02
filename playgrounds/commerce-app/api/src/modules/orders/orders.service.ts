import type { Order } from "./order.model";

export class OrdersService {
  createOrder(cartId: string): Order {
    return {
      id: `ord_${cartId}`,
      cartId,
      fulfillmentStatus: "pending"
    };
  }

  markShipped(order: Order): Order {
    return {
      ...order,
      fulfillmentStatus: "shipped"
    };
  }
}
