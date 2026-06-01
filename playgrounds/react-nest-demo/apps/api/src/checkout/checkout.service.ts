import { PricingService } from "./pricing.service";
import { CouponService } from "./coupon.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CheckoutRequest } from "../../../../packages/shared/src/checkout/contracts";

export class CheckoutService {
  constructor(
    private readonly pricingService = new PricingService(),
    private readonly couponService = new CouponService(),
    private readonly notificationsService = new NotificationsService()
  ) {}

  submit(payload: CheckoutRequest) {
    const coupon = this.couponService.findCoupon(payload.couponCode);
    const discount = this.pricingService.calculateDiscount(coupon, payload.subtotal);
    const total = payload.subtotal - discount;

    this.notificationsService.sendOrderConfirmation(payload.userId, total);

    return {
      total,
      discount
    };
  }
}
