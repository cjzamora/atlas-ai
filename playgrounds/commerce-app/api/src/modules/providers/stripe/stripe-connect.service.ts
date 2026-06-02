import type { StripeConnectedAccount, StripeConnectCharge } from "./stripe-connect.model";

export class StripeConnectService {
  createConnectedAccountOnboardingLink(account: StripeConnectedAccount) {
    return `/connect/onboarding/${account.accountId}`;
  }

  createConnectedAccountLoginLink(account: StripeConnectedAccount) {
    return account.loginLinkUrl;
  }

  listConnectedAccountCharges(charges: StripeConnectCharge[], connectedAccountId: string) {
    return charges.filter((charge) => charge.connectedAccountId === connectedAccountId);
  }
}
