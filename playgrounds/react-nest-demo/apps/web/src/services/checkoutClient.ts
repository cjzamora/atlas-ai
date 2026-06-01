import { CheckoutRequest } from "../../../../packages/shared/src/checkout/contracts";

export async function submitCheckout(payload: CheckoutRequest) {
  return {
    endpoint: "/api/checkout/submit",
    payload
  };
}
