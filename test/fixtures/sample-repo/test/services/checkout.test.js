import { applyCoupon } from "../../src/services/checkout.js";

export function checkoutTestCase() {
  return applyCoupon({ subtotal: 25 }, { expired: false, amountOff: 10 });
}
