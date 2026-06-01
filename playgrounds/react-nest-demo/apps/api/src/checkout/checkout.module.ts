import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { PricingService } from "./pricing.service";
import { CouponService } from "./coupon.service";

export class CheckoutModule {
  controllers = [CheckoutController];
  providers = [CheckoutService, PricingService, CouponService];
}
