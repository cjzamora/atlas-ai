import { CheckoutPage } from "../../apps/web/src/pages/CheckoutPage";

export function checkoutPageTestCase() {
  const page = CheckoutPage();
  return page.submit({
    subtotal: 50,
    couponCode: "WELCOME10",
    userId: "user-1"
  });
}
