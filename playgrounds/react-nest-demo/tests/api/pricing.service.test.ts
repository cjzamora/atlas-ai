import { PricingService } from "../../apps/api/src/checkout/pricing.service";

export function pricingServiceTestCase() {
  const service = new PricingService();
  return service.calculateDiscount(
    {
      code: "WELCOME10",
      amountOff: 10,
      expiresAt: "2099-01-01T00:00:00.000Z"
    },
    50
  );
}
