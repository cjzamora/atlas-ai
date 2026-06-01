export type CheckoutRequest = {
  subtotal: number;
  couponCode?: string;
  userId: string;
};

export type Coupon = {
  code: string;
  amountOff: number;
  expiresAt: string;
};
