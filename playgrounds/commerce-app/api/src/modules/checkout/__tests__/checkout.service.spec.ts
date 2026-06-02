import { CheckoutService } from "../checkout.service";

export function checkoutServiceSpec() {
  const service = new CheckoutService();
  return service.createPaymentIntent("cart_123", 5000);
}
