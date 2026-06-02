export type PaymentIntentSummary = {
  id: string;
  amountCents: number;
  currency: string;
  status: "requires_payment_method" | "processing" | "succeeded";
};

export type CheckoutSession = {
  cartId: string;
  paymentIntent: PaymentIntentSummary;
};
