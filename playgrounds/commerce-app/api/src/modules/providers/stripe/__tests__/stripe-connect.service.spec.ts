import { StripeConnectService } from "../stripe-connect.service";

export function stripeConnectServiceSpec() {
  const service = new StripeConnectService();
  return service.createConnectedAccountLoginLink({
    accountId: "acct_123",
    onboardingComplete: true,
    loginLinkUrl: "https://dashboard.stripe.test/login"
  });
}
