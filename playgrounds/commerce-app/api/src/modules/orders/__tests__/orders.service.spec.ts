import { OrdersService } from "../orders.service";

export function ordersServiceSpec() {
  const service = new OrdersService();
  return service.createOrder("cart_123");
}
