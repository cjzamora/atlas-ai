import { login } from "../services/authClient";

export function LoginPage() {
  return {
    submit: login
  };
}
