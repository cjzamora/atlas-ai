import { CheckoutRequest } from "../../../../packages/shared/src/checkout/contracts";

export function buildCheckoutPayload(formState): CheckoutRequest {
  return {
    subtotal: formState.subtotal,
    couponCode: formState.couponCode,
    userId: formState.userId
  };
}
