import { CheckoutPage } from "./pages/CheckoutPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  return {
    login: LoginPage,
    checkout: CheckoutPage
  };
}
