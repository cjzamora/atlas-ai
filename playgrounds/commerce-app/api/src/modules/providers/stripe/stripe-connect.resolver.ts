import { StripeConnectService } from "./stripe-connect.service";
import type { StripeConnectedAccount } from "./stripe-connect.model";

export class StripeConnectResolver {
  constructor(private readonly stripeConnect: StripeConnectService) {}

  connectedAccountLoginLink(account: StripeConnectedAccount) {
    return this.stripeConnect.createConnectedAccountLoginLink(account);
  }
}
