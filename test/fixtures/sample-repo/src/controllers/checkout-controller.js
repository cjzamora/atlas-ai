import { applyCoupon } from "../services/checkout.js";

export function submitCheckout(checkout, coupon) {
  return applyCoupon(checkout, coupon);
}
