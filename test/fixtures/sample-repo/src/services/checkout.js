import { calculateDiscount } from "./pricing.js";

export function applyCoupon(checkout, coupon) {
  const discount = calculateDiscount(coupon, checkout.subtotal);
  return {
    ...checkout,
    discount,
    total: checkout.subtotal - discount
  };
}
