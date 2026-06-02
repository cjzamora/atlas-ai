import { CheckoutService } from "./checkout.service";

export class CheckoutResolver {
  constructor(private readonly checkout: CheckoutService) {}

  createCheckout(cartId: string, subtotalCents: number) {
    return this.checkout.createPaymentIntent(cartId, subtotalCents);
  }
}
