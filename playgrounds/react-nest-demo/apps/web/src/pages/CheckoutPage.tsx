import { submitCheckout } from "../services/checkoutClient";
import { buildCheckoutPayload } from "../utils/buildCheckoutPayload";

export function CheckoutPage() {
  return {
    submit(checkoutForm) {
      return submitCheckout(buildCheckoutPayload(checkoutForm));
    }
  };
}
