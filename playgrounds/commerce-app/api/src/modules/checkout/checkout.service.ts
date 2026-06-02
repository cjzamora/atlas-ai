import { validateCartSubtotal, validateDiscountCode } from "./discount.validation";
import type { CheckoutSession } from "./payment-intent.model";

export class CheckoutService {
  createPaymentIntent(cartId: string, subtotalCents: number, currency = "usd"): CheckoutSession {
    if (!validateCartSubtotal(subtotalCents)) {
      throw new Error("Invalid cart subtotal");
    }

    return {
      cartId,
      paymentIntent: {
        id: `pi_${cartId}`,
        amountCents: subtotalCents,
        currency,
        status: "requires_payment_method"
      }
    };
  }

  applyDiscount(code: string, country: string) {
    return validateDiscountCode(code, country);
  }
}
