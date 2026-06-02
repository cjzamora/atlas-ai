import { StripeConnectResolver } from "../stripe-connect.resolver";
import { StripeConnectService } from "../stripe-connect.service";

export function stripeConnectResolverSpec() {
  const resolver = new StripeConnectResolver(new StripeConnectService());
  return resolver.connectedAccountLoginLink({
    accountId: "acct_123",
    onboardingComplete: true,
    loginLinkUrl: "https://dashboard.stripe.test/login"
  });
}
