import { CheckoutService } from "../../apps/api/src/checkout/checkout.service";

export function checkoutServiceTestCase() {
  const service = new CheckoutService();
  return service.submit({
    subtotal: 50,
    couponCode: "WELCOME10",
    userId: "user-1"
  });
}
