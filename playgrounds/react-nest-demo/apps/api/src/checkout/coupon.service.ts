import { Coupon } from "../../../../packages/shared/src/checkout/contracts";

export class CouponService {
  findCoupon(code?: string): Coupon | null {
    if (!code) {
      return null;
    }

    return {
      code,
      amountOff: 10,
      expiresAt: "2099-01-01T00:00:00.000Z"
    };
  }
}
