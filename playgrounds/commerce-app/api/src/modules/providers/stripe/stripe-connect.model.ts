export type StripeConnectedAccount = {
  accountId: string;
  onboardingComplete: boolean;
  loginLinkUrl: string;
};

export type StripeConnectCharge = {
  chargeId: string;
  connectedAccountId: string;
  amountCents: number;
};
