import { CheckoutService } from "./checkout.service";
import { CheckoutRequest } from "../../../../packages/shared/src/checkout/contracts";

export class CheckoutController {
  constructor(private readonly checkoutService = new CheckoutService()) {}

  submit(payload: CheckoutRequest) {
    return this.checkoutService.submit(payload);
  }
}
