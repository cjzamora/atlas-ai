import { calculateDiscount } from "../../src/services/pricing.js";

export function pricingTestCase() {
  return calculateDiscount({ expired: false, amountOff: 10 }, 25);
}
