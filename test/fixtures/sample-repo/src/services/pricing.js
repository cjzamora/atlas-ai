export function calculateDiscount(coupon, subtotal) {
  if (!coupon || coupon.expired) {
    return 0;
  }

  return Math.min(subtotal, coupon.amountOff || 0);
}
