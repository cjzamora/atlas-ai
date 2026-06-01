import { Coupon } from "../../../../packages/shared/src/checkout/contracts";

export class PricingService {
  calculateDiscount(coupon: Coupon | null, subtotal: number) {
    if (!coupon) {
      return 0;
    }

    if (coupon.expiresAt < new Date().toISOString()) {
      return 0;
    }

    return Math.min(subtotal, coupon.amountOff);
  }
}
